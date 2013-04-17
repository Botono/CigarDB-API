var
  restify = require('restify'),
  url = require('url'),
  mongoose = require('mongoose'),
  Schema = mongoose.Schema,
  config = require('./config'),
  db = mongoose.connect(config.creds.mongoose_auth),
  schemas = require('./schema.js'),
  tmp_brands = require('./tmp_data/brands.js'),
  tmp_domains = require('./tmp_data/cigar_domain_values.js'),
  tmp_cigars_2 = require('./tmp_data/cigars2.js'),
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

function populateDB() {
  // brands
  User.find().exec(function (err, docs) {
    if (docs.length == 0) {
      console.log('Adding users and keys');
      var new_user_id;
      var new_user = new User();
      new_user.username = 'aaron.murray';
      new_user.email = 'aaron.murray@cigardb.co';
      new_user.date_joined = new Date();
      new_user.save(function (err, new_user) {
        new_user_id = new_user.id;
      });
      var new_key = new App();
      new_key.api_key = '2483f102-e4ae-4b41-b56f-e9e344ef9083';
      new_key.user_id = new_user_id;
      new_key.access_level = 99;
      new_key.date_created = new Date();
      new_key.save();
      var new_user = new User();
      new_user.username = 'developer_test';
      new_user.email = 'foo@bar.com';
      new_user.date_joined = new Date();
      new_user.save(function (err, new_user) {
        new_user_id = new_user.id;
      });
      var new_key = new App();
      new_key.api_key = 'ca9e8600-ab8d-4181-940d-b57cd8277dab';
      new_key.user_id = new_user_id;
      new_key.access_level = 0;
      new_key.date_created = new Date();
      new_key.save();
      var new_user = new User();
      new_user.username = 'premium_test';
      new_user.email = 'bar@foo.com';
      new_user.date_joined = new Date();
      new_user.save(function (err, new_user) {
        new_user_id = new_user.id;
      });
      var new_key = new App();
      new_key.api_key = '1f29f79b-7303-43b2-8bd1-6c5d5d4dc13d';
      new_key.user_id = new_user_id;
      new_key.access_level = 1;
      new_key.date_created = new Date();
      new_key.save();
    }
  });
  Brand.find().exec(function (err, docs) {
    if (docs.length == 0) {
      console.log('No brands found, populating Brands collection.');
      for (var i = 0; tmp_brands[i]; i++) {
        var new_brand = new Brand();
        new_brand.name = tmp_brands[i];
        new_brand.status = 'approved';
        new_brand.updated = new Date();
        new_brand.save();
      }
    }
  });
  AttributeDomain.find().exec(function (err, docs) {
    if (docs.length == 0) {
      console.log('No attribute domains found, populating AttributeDomains collection.');
      var new_dom = new AttributeDomain();
      new_dom.binders = tmp_domains.binders;
      new_dom.colors = tmp_domains.colors;
      new_dom.countries = tmp_domains.countries;
      new_dom.fillers = tmp_domains.fillers;
      new_dom.strengths = tmp_domains.strengths;
      new_dom.wrappers = tmp_domains.wrappers;
      new_dom.vitolas = tmp_domains.vitolas;
      new_dom.save();
    }
  });
  console.log('DOMAIN VALUE CLEANUP');
  for (var i=0;i<1000;i++) {
    var
      raw_binder,
      raw_filler,
      raw_wrapper;
    if (tmp_cigars_2[i]['binder']) {
      raw_binder = tmp_cigars_2[i].binder.split(',');
      console.log('RAW BINDER: '+ JSON.stringify(raw_binder));
      raw_binder = clean_domain_values(raw_binder, tmp_domains.binders);

      console.log('BINDER: '+ JSON.stringify(raw_binder));
    }
    if (tmp_cigars_2[i]['filler']) {
      raw_filler = tmp_cigars_2[i].filler.split(',');
      console.log('RAW FILLER: '+ JSON.stringify(raw_filler));
      raw_filler = clean_domain_values(raw_filler, tmp_domains.fillers);

      console.log('FILLER: '+ JSON.stringify(raw_filler));
    }
    if (tmp_cigars_2[i]['wrapper']) {
      raw_wrapper = tmp_cigars_2[i].wrapper.split(',');
      console.log('RAW WRAPPER: '+ JSON.stringify(raw_wrapper));
      raw_wrapper = clean_domain_values(raw_wrapper, tmp_domains.wrappers);

      console.log('WRAPPER: '+ JSON.stringify(raw_wrapper));
    }
  }
}

function clean_domain_values(raw_data, valid_values) {
  if(!('contains' in String.prototype))
    String.prototype.contains = function(str, startIndex) { return -1!==this.indexOf(str, startIndex); };
  var cleaned_values = valid_values.filter(function (value) {
    if (value == 'Connecticut') {
      return raw_data[0].contains(value) && (!raw_data[0].contains('Connecticut Broadleaf') && !raw_data[0].contains('Connecticut Shade'));
    } else if (value == 'Criollo') {
      return raw_data[0].contains(value) && (!raw_data[0].contains('Havana 98 Criollo'));
    } else {
      return raw_data[0].contains(value);
    }
  });
  return cleaned_values;
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
/*
 // Cigar routes
 server.get('/cigars', getCigars);
 server.get('/cigars/:id', getCigar);
 server.post('/cigars', createCigar);
 server.put('/cigars/:id', updateCigar);
 server.delete('/cigars/:id', removeCigar);
 */
populateDB();
server.listen(8080);
console.log('Server started...')