var
    restify = require('restify'),
    url = require('url'),
    mongoose = require('mongoose'),
    restifyValidator = require('restify-validator'),
    Schema = mongoose.Schema,
    config = require('./config.js'),
    db = mongoose.connect(config.creds.mongoose_auth),
    schemas = require('./schema.js'),
//populateDB = require('./data_import.js'),
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

// TODO fine tune update process. Scrub incoming values
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
            res.status(200);
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

    Cigar.findOne({_id: req.params.id, status: 'approved'}, '').lean().exec(function (err, doc) {
        if (err) {
            return next(new restify.InternalError('FAIL'));
        } else if (!doc) {
            return next(new restify.ResourceNotFoundError("Cigar not found."));
        } else {
            var return_obj = {data: {}};
            for (field in doc) {
                // Remove Mongoose version field and rename MongoDB _id field for return
                if (field == '__v') {
                    continue;
                } else if (field == '_id') {
                    return_obj.data.id = doc[field];
                } else {
                    return_obj['data'][field] = doc[field];
                }
            }
            res.send(return_obj);
            return next();
        }
    });
}
// TODO handle querying status (e.g.: admins looking for documents in the queue)

function createCigar(req, res, next) {
    // Create a new Cigar entry (aka: Where the Magic Happens)
    // Minimum required fields are brand and name
    var
        required_fields = ['brand', 'name'],// I know it's not used.
        list_fields = ['wrappers', 'binders', 'fillers'],
        fields_to_validate = [],
        return_obj = {data: {}, message: ''},
        tmp_list,
        cigar = new Cigar();

    if (!(req.params.brand && req.params.name) && req.access_level < 1) {
        return next(new restify.MissingParameterError("You must supply at least the following: a brand and a name"));
    }

    // Get a list of fields for which we have known domain values so we can validate them below.
    for (field in req.attribute_domains) {
        fields_to_validate.push(field);
    }
    console.log(JSON.stringify(fields_to_validate));
    // TODO refactor this mess in light of new validation scheme
    /*for (param in req.params) {
     // Only accept parameters that are in the list of fields for cigars (set in validation .use() below)
     if (req.cigar_fields.indexOf(param) != -1) {
     console.log(param + ' is a cigar field!');
     if (fields_to_validate.indexOf(param) != -1) {
     // Compare the values supplied against our list of valid values.
     if (list_fields.indexOf(param) != -1) {
     // These are stored as lists, so we gotta make em lists.
     tmp_list = req.params[param].split(',');
     for (var i=0;tmp_list[i];i++) {
     // TODO think about factoring this out.
     if (req.attribute_domains[param].indexOf(tmp_list[i]) == -1) {
     return next(new restify.ResourceNotFoundError("One of the values you submitted for this cigar's " +param+ " ("+tmp_list[i]+") is not in the list of allowed values. Please contact the admins to request that it be added before attempting to use it."))
     }
     }
     cigar[param] = tmp_list;
     } else {
     if (req.attribute_domains[param].indexOf(req.params[param]) == -1) {
     return next(new restify.ResourceNotFoundError("One of the values you submitted for this cigar's " +param+ " ("+req.params[param]+") is not in the list of allowed values. Please contact the admins to request that it be added before attempting to use it."))
     } else {
     cigar[param] = req.params[param];
     }
     }
     } else {
     cigar[param] = req.params[param];
     }
     } else if (req.system_fields.indexOf(param) == -1) {
     console.log(param + ' not a cigar or a system field!!!!!');
     // If the field is not a cigar field and not a system field, do not accept the request.
     return next(new restify.InvalidArgumentError('One of the fields you submitted ('+param+') is not valid. Please resubmit with only valid fields. If you feel this field should be added, please contact the administrators.'));
     }
     } */
    for (param in req.params) {
        // Only accept parameters that are in the list of fields for cigars (set in validation .use() below)
        cigar[param] = req.params[param];
    }

    // Let's make sure the brand they specified already exists. createCigar() is no place to createBrand()
    // Don't check status so that users can create brands and cigars together without waiting for brands to get approved.
    Brand.find({name: cigar.brand}, 'name').exec(function (err, docs) {
        if (err) {
            return next(new restify.InternalError(err));
        } else if (docs.length == 0) {
            return next(new restify.ResourceNotFoundError("The Brand you specified was not found in the database. If you want to add a new brand and associated cigars, please create the brand first."));
        }
    });

    // Admins skip the queue
    if (req.access_level == 99) {
        cigar.status = 'approved';
    } else {
        cigar.status = 'create_pending';
    }

    cigar.save(function (err, cigar) {
        if (err) {
            return next(err);
        } else {
            res.status(202);
            return_obj.message = "The cigar has been created and is awaiting approval."
            return_obj.data = {"id": cigar.id};
            res.send(return_obj);
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

function cigarDBFormatJSON(req, res, body) {
    if (body instanceof Error) {
        // snoop for RestError or HttpError, but don't rely on
        // instanceof
        res.statusCode = body.statusCode || 500;

        if (body.name && body.name == 'ValidationError') {
            var err_msg = '';
            if (Object.keys(body.errors).length > 1) {
                var fields_in_error = Object.keys(body.errors);
                err_msg = 'The following fields failed validation: ' + fields_in_error.join(', ');
            } else {
                err_msg = body.errors[Object.keys(body.errors)[0]].type;
            }
            body = {
                message: err_msg
            };
        } else if (body.body) {
            body = body.body;
        } else {
            body = {
                message: body.message
            };
        }
    } else if (Buffer.isBuffer(body)) {
        body = body.toString('base64');
    }

    var data = JSON.stringify(body);
    res.setHeader('Content-Length', Buffer.byteLength(data));

    return (data);
}


var server = restify.createServer({
    name: 'CigarDB API',
    formatters: {
        'application/json; q=0.9': cigarDBFormatJSON
    }
});


// Set up our routes and start the server
server.use(restify.queryParser());
server.use(restify.bodyParser());
server.use(restifyValidator);

server.use(function (req, res, next) {
    // Verify the API Key and pass along the access level
    var
        theKey = req.params.api_key,
        cigar_fields = ['brand', 'name', 'vitola', 'color', 'fillers', 'wrappers', 'binders', 'strength', 'ring_gauge', 'length'],
        system_fields = ['api_key'],
        mongo_fields = ['__v', '_id'],
        attribute_domains = {},
        promise;

    if (!theKey) {
        return next(new restify.MissingParameterError("API key missing."));
    }
    promise = AttributeDomain.find().lean().exec();
    promise.then(
        function (attrdomains) {
            for (param in attrdomains[0]) {
                if (mongo_fields.indexOf(param) == -1) {
                    attribute_domains[param] = attrdomains[0][param];
                }
            }
            return App.findOne({api_key: theKey}, 'api_key access_level').exec(); // Returns a promise
        }).then(
        function (apikey) {
            if (!apikey) {
                throw new Error("API key not found!");
            }
            req.access_level = apikey.access_level;
            req.cigar_fields = cigar_fields;
            req.attribute_domains = attribute_domains;
            req.system_fields = system_fields;
            return next();
        }
    ).then(null, function (err) {
            return next(new restify.InternalError(err.message));
        }
    );
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