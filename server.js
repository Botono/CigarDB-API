var
  restify = require('restify'),
  url = require('url'),
  mongoose = require('mongoose'),
  Schema = mongoose.Schema,
  config = require('./config'),
  db = mongoose.connect(config.creds.mongoose_auth),
  schemas = require('./schema.js'),
//populateDB = require('./data_import.js')
  Brand = mongoose.model('Brand', schemas.BrandSchema),
  AttributeDomain = mongoose.model('AttributeDomain', schemas.AttributeDomainSchema),
  Cigar = mongoose.model('Cigar', schemas.CigarSchema),
  User = mongoose.model('User', schemas.UserSchema),
  App = mongoose.model('App', schemas.AppSchema),
  UpdateRequest = mongoose.model('UpdateRequest', schemas.UpdateRequestSchema),
  DeleteRequest = mongoose.model('DeleteRequest', schemas.DeleteRequestSchema);

function getBrands(req, res, next) {
  // Return a list of all brands, paginated
  // Name parameter must be passed if not premium

  if (!req.params.name && req.access_level < 1) {
    return next(new restify.MissingParameterError("You must supply at least a name."));
  }
  var limit = (req.access_level > 0) ? 9999 : 50,
    nameRegEx = new RegExp(req.params.name, 'i'),
    page = (req.params.page) ? req.params.page : 1,
    skip = (page > 1) ? page * 50 : 0;

  Brand.find({name: nameRegEx, status: 'approved'}, 'name', {limit: limit, skip: skip}).sort('name').exec(function (err, docs) {
    // TODO admins can query non-approved
    if (err) {
      return next(new restify.InternalError('FAIL'));
    } else if (docs.length == 0) {
      return next(new restify.ResourceNotFoundError("No records found!"));
    } else {
      res.send(docs);
      return next();
    }
  });
}

function getBrand(req, res, next) {
  // Return a single Brand

  if (!req.params.id) {
    return next(new restify.MissingParameterError("You must supply an ID."));
  }

  Brand.findOne({_id: req.params.id, status: 'approved'}, 'name location founding_date status updated').exec(function (err, docs) {
    if (err) {
      return next(new restify.InternalError('FAIL'));
    } else if (!docs) {
      return next(new restify.ResourceNotFoundError("Brand not found!"));
    } else {
      res.send(docs);
      return next();
    }

  });
}

function createBrand(req, res, next) {
  // Create a new Brand entry
  // Minimum required field is name
  if (!req.params.name) {
    return next(restify.MissingParameterError('You must supply at least a name.'));
  }
  console.log('Creating a new brand');
  // Let's fill in the values manually
  var name = req.params.name,
    status = 'create_pending',
    location = req.params.location || '',
    founding_date = req.params.founding_date || '',// TODO find out why founding_date is coming up null
    brand = new Brand();
  if (req.access_level == 99) {
    // Admins skip the queue
    status = 'approved';
  }
  brand.name = name;
  brand.status = status;
  brand.location = location;
  brand.founding_date = founding_date;
  brand.save(function (err, brand) {
    if (err) {
      return next(err);
    } else {
      res.status(202);
      var data = [
        {"data": {"id": brand.id}, "message": "The brand has been created and is awaiting approval."}
      ];
      res.send(data);
      return next();
    }
  });

}

// TODO fine tune update process. Scub incoming values
function updateBrand(req, res, next) {
  if (!req.params.id) {
    return next(restify.MissingParameterError('You must supply an ID.'));
  }
  var update_req = new UpdateRequest();
  update_req.type = 'brand';
  update_req.data = req.params;
  update_req.save(function (err, update_req) {
    if (err) {
      return next(err);
    } else {
      res.status(202);
      var data = [
        {"message": "The update has been submitted and is awaiting approval."}
      ];
      res.send(data);
      ;
      return next();
    }
  })
}

function removeBrand(req, res, next) {
  if (!req.params.id) {
    return next(restify.MissingParameterError('You must supply an ID.'));
  } else if (!req.params.reason) {
    return next(restify.MissingParameterError('You must provide a reason.'))
  }
  var delete_req = new DeleteRequest();
  delete_req.target_id = req.params.id;
  delete_req.reason = req.params.reason;
  delete_req.type = 'brand';
  delete_req.save(function (err, delete_req) {
    if (err) {
      return next(err);
    } else {
      res.status(202);
      var data = [
        {"message": "The delete request has been submitted and is awaiting approval."}
      ];
      res.send(data);
      return next();
    }
  });
}

function getCigars(req, res, next) {
  /*
   Return a list of all cigars, paginated
   User must filter by at least 1 field, unless they are premium.
   */
  var
    param_found = false,
    doc_count = 0,
    limit = (req.access_level > 0) ? 9999 : 50,
    page = (req.params.page) ? req.params.page : 1,
    skip = (page > 1) ? page * 50 : 0,
    sort_field = '',
    limit_fields = (req.params.limit_fields) ? 'name brand' : '',
    required_fields = ['brand', 'name', 'vitola', 'color', 'fillers', 'wrappers', 'binders', 'strength'],
    query_obj = {status: 'approved'},
    return_obj = {};

  for (param in req.params) {
    if (required_fields.indexOf(param) != -1) {
      if (param == 'name') {
        query_obj[param] = new RegExp(req.params.name, 'i');
      } else if (param == ('fillers' || 'wrappers' || 'binders')) {
        query_obj[param] = {};
        query_obj[param]['$in'] = req.params[param].split(',');
      } else {
        query_obj[param] = req.params[param];
      }
      param_found = true;
    }
  }

  if (!param_found && req.access_level < 1) {
    return next(new restify.MissingParameterError("You must supply at least one field."));
  }

  if (req.params.sort_field) {
    sort_field = req.params.sort_field;
    if (req.params.sort_direction && req.params.sort_direction == 'desc') {
      sort_field = '-' + sort_field;
    }
  }
  console.log('QUERY: ' + JSON.stringify(query_obj));

  // Get a count of documents in this query to we can calculate number of pages later.
  Cigar.find(query_obj).count(function (err, count) {
    if (err) {
      return next(new restify.InternalError(err));
    } else {
      doc_count = count;
    }
  });
  // TODO add query complexity from getCigars() to getBrands()

  // Query that mofo!
  Cigar.find(query_obj, limit_fields, {limit: limit, skip: skip}).sort(sort_field).lean().exec(function (err, docs) {
    if (err) {
      return next(new restify.InternalError(err));
    } else if (docs.length == 0) {
      return next(new restify.ResourceNotFoundError("No records found!"));
    } else {
      return_obj.numberOfPages = Math.floor(doc_count / limit);
      return_obj.currentPage = page;
      return_obj.data = [];
      for (var i = 0; docs[i]; i++) {
        var current_doc = {};
        for (field in docs[i]) {
          // Remove Mongoose version field and rename MongoDB _id field for return
          if (field == '__v') {
            continue;
          } else if (field == '_id') {
            current_doc.id = docs[i][field];
          } else {
            current_doc[field] = docs[i][field];
          }
        }
        return_obj.data.push(current_doc);
      }
      res.send(return_obj);
      return next();
    }
  });
}

function getCigar(req, res, next) {
  // Return a single Brand

  if (!req.params.id) {
    return next(new restify.MissingParameterError("You must supply an ID."));
  }

  Cigar.findOne({_id: req.params.id, status: 'approved'}, '').exec(function (err, docs) {
    if (err) {
      return next(new restify.InternalError('FAIL'));
    } else if (!docs) {
      return next(new restify.ResourceNotFoundError("Brand not found!"));
    } else {
      res.send(docs);
      return next();
    }

  });
}

function createCigar(req, res, next) {
  // Create a new Brand entry
  // Minimum required field is name
  if (!req.params.name) {
    return next(restify.MissingParameterError('You must supply at least a name.'));
  }
  console.log('Creating a new brand');
  // Let's fill in the values manually
  var name = req.params.name,
    status = 'create_pending',
    location = req.params.location || '',
    founding_date = req.params.founding_date || '',
    cigar = new Cigar();
  if (req.access_level == 99) {
    // Admins skip the queue
    status = 'approved';
  }
  cigar.name = name;
  cigar.status = status;
  cigar.location = location;
  cigar.founding_date = founding_date;
  cigar.save(function (err, brand) {
    if (err) {
      return next(err);
    } else {
      res.status(202);
      var data = [
        {"data": {"id": brand.id}, "message": "The brand has been created and is awaiting approval."}
      ];
      res.send(data);
      return next();
    }
  });

}

function updateCigar(req, res, next) {
  if (!req.params.id) {
    return next(restify.MissingParameterError('You must supply an ID.'));
  }
  var update_req = new UpdateRequest();
  update_req.type = 'brand';
  update_req.data = req.params;
  update_req.save(function (err, update_req) {
    if (err) {
      return next(err);
    } else {
      res.status(202);
      var data = [
        {"message": "The update has been submitted and is awaiting approval."}
      ];
      res.send(data);
      ;
      return next();
    }
  })
}

function removeCigar(req, res, next) {
  if (!req.params.id) {
    return next(restify.MissingParameterError('You must supply an ID.'));
  } else if (!req.params.reason) {
    return next(restify.MissingParameterError('You must provide a reason.'))
  }
  var delete_req = new DeleteRequest();
  delete_req.target_id = req.params.id;
  delete_req.reason = req.params.reason;
  delete_req.type = 'brand';
  delete_req.save(function (err, delete_req) {
    if (err) {
      return next(err);
    } else {
      res.status(202);
      var data = [
        {"message": "The delete request has been submitted and is awaiting approval."}
      ];
      res.send(data);
      return next();
    }
  });
}


var server = restify.createServer({
  name: 'CigarDB API'
})

// Set up our routes and start the server
server.use(restify.queryParser());
server.use(restify.bodyParser());

server.use(function (req, res, next) {
  // Verify the API Key and pass along the access level
  var theKey = req.params.api_key;
  if (!theKey) {
    return next(new restify.MissingParameterError("API key missing."));
  }
  App.find({api_key: theKey}, 'api_key access_level').exec(function (err, docs) {
    if (err) {
      return next(new restify.InternalError("FAIL"));
    } else if (docs.length == 0) {
      return next(new restify.NotAuthorizedError("Key not found!"));
    } else {
      req.access_level = docs[0].access_level;
      return next();
    }

  });
});

// Brand routes
server.get('/brands', getBrands);
server.get('/brands/:id', getBrand);
server.post('/brands', createBrand);
server.put('/brands/:id', updateBrand);
server.del('/brands/:id', removeBrand);

// Cigar routes
server.get('/cigars', getCigars);
server.get('/cigars/:id', getCigar);
server.post('/cigars', createCigar);
server.put('/cigars/:id', updateCigar);
server.del('/cigars/:id', removeCigar);


server.listen(8080);
console.log('Server started...')