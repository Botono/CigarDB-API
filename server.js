var
    restify = require('restify'),
    url = require('url'),
    mongoose = require('mongoose'),
    bunyan = require('bunyan'),
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
    DeleteRequest = mongoose.model('DeleteRequest', schemas.DeleteRequestSchema),
    APILog = mongoose.model('APILog', schemas.LogSchema),
    CigarDB = {}; // Namespace


// Constants
CigarDB.APPROVED = 'approved';
CigarDB.CREATE_PENDING = 'create_pending';
CigarDB.DENIED = 'denied';
CigarDB.DELETED = 'deleted';

CigarDB.cleanEmptyList = function (val) {
    // Feeling kind of anal about these list values.
    if (val === ['']) {
        return [];
    } else {
        return val;
    }
};
// Assemble the object which defines our custom log fields
CigarDB.buildCustomLogFields = function (req, err) {
    var log_object = {};
    if (err) {
        log_object.err = err;
    }
    if (req.params) {
        log_object.api_key = req.params.api_key;
        log_object.params = req.params;
    } else {
        log_object.api_key = req.api_key;
    }
    log_object.req = req;
    return log_object;
};

// My Bunyan stream for saving log entries to MongoDB
CigarDB.saveLog = function () {
};
CigarDB.saveLog.prototype.write = function (rec) {
    if (typeof (rec) !== 'object') {
        console.error('error: raw stream got a non-object record: %j', rec)
    } else {
        var new_log = new APILog();
        for (param in rec) {
            new_log[param] = rec[param];
        }
        new_log.save(function (err, new_log_instance) {
            if (err) {
                // Could not save log entry. Fail silently and with much shame. /facepalm
            }
        });
    }
};

// My custom JSON formatter, based off default code. Adds ValidationError handling for Mongoose validation
CigarDB.cigarDBFormatJSON = function (req, res, body) {
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
                if (body.errors[Object.keys(body.errors)[0]].type == 'required') {
                    err_msg = 'The field ' + Object.keys(body.errors)[0] + ' is required.';
                } else {
                    err_msg = body.errors[Object.keys(body.errors)[0]].type;
                }

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

CigarDB.getBrands = function (req, res, next) {
    // Return a list of all brands, paginated or
    // search for brands by name if name parameter supplied.
    // Premium members get full list without paging.

    var limit = (req.access_level > 0) ? 0 : 50,
        page = (req.params.page) ? req.params.page : 1,
        skip = (page > 1) ? page * 50 : 0,
        options_obj = {skip: skip},
        return_obj = {message: '', data: []},
        query_obj = {status: CigarDB.APPROVED},
        doc_count = 0;

    if (limit > 0) {
        options_obj.limit = limit;
    }
    console.log(JSON.stringify(req.api_key));
    console.log(JSON.stringify(req.access_level));
    if (req.params.name) {
        query_obj.name = new RegExp(req.params.name, 'i');
    }

    // Get a count of documents in this query to we can calculate number of pages later.
    Brand.find(query_obj, 'name').count().exec().then(
        function (count) {
            doc_count = count;
            return Brand.find(query_obj, '', options_obj).sort('name').lean().exec(); // Returns a promise
        }
    ).then(
        function (brands) {
            // TODO admins can query non-approved
            if (brands.length == 0) {
                throw new restify.ResourceNotFoundError("No records found!");
            } else {
                return_obj.numberOfPages = Math.floor(doc_count / limit);
                return_obj.currentPage = parseInt(page);
                for (var i = 0; brands[i]; i++) {
                    var current_doc = {};
                    for (field in brands[i]) {
                        // Remove Mongoose version field and rename MongoDB _id field for return
                        if (field == '__v') {
                            continue;
                        } else if (field == '_id') {
                            current_doc.id = brands[i][field];
                        } else {
                            current_doc[field] = brands[i][field];
                        }
                    }
                    return_obj.data.push(current_doc);
                }
                res.send(return_obj);
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: getBrands: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getBrands: ' + err.message);
            return next(err);
        });
};


CigarDB.getBrand = function (req, res, next) {
    // Return a single Brand

    var
        limit_fields = 'name location founding_date website status updated',
        return_obj = {data: {}};

    if (!req.params.id) {
        var err = new restify.MissingParameterError("You must supply an ID.");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getBrand: ID parameter not provided');
        return next(err);
    }

    Brand.findOne({_id: req.params.id, status: CigarDB.APPROVED}, limit_fields).exec(function (err, doc) {
        if (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getBrand: Query failed');
            return next(err);
        } else if (!doc) {
            var err = new restify.ResourceNotFoundError("Brand not found!");
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getBrand: Query returned no documents');
            return next(err);
        } else {
            res.status(200);
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
            req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: getBrand: All clear');
            return next();
        }

    });
};

CigarDB.createBrand = function (req, res, next) {
    // Create a new Brand entry
    // Minimum required field is name
    if (!req.params.name) {
        var err = new restify.MissingParameterError('You must supply at least a name.');
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: createBrand: Name parameter not provided');
        return next(err);
    }
    console.log('Creating a new brand');
    // Let's fill in the values manually
    var name = req.params.name,
        status = CigarDB.CREATE_PENDING,
        location = req.params.location || '',
        founding_date = req.params.founding_date || '',// TODO find out why founding_date is coming up null
        brand = new Brand();

    if (req.access_level == 99) {
        // Admins skip the queue
        status = CigarDB.APPROVED;
    }
    brand.name = name;
    brand.status = status;
    brand.location = location;
    brand.founding_date = founding_date;
    brand.save(function (err, brand) {
        if (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: createBrand: Save failed');
            return next(err);
        } else {
            res.status(202);
            var data = {"data": {"id": brand.id}, "message": "The brand has been created and is awaiting approval."};
            res.send(data);
            req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: createBrand: All clear');
            return next();
        }
    });
};

// TODO fine tune update process. Scrub incoming values
CigarDB.updateBrand = function (req, res, next) {
    if (!req.params.id) {
        var err = new restify.MissingParameterError('You must supply an ID.');
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: updateBrand: ID parameter not provided');
        return next(err);
    }
    var update_req = new UpdateRequest();
    update_req.type = 'brand';
    update_req.data = req.params;
    update_req.save(function (err, update_req) {
        if (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: updateBrand: Save failed');
            return next(err);
        } else {
            res.status(202);
            var data = {"message": "The update has been submitted and is awaiting approval."};
            res.send(data);
            req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: updateBrand: All clear');
            return next();
        }
    })
};

CigarDB.removeBrand = function (req, res, next) {

    var err;

    if (!req.params.id) {
        err = new restify.MissingParameterError('You must supply an ID.');
    } else if (!req.params.reason) {
        err = new restify.MissingParameterError('You must provide a reason.');
    }
    if (err) {
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: removeBrand: Required parameter not provided');
        return next(err);
    }

    var delete_req = new DeleteRequest();
    delete_req.target_id = req.params.id;
    delete_req.reason = req.params.reason;
    delete_req.type = 'brand';
    delete_req.save(function (err, delete_req) {
        if (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: removeBrand: Save failed');
            return next(err);
        } else {
            res.status(202);
            var data = {"message": "The delete request has been submitted and is awaiting approval."};
            res.send(data);
            req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: removeBrand: All clear');
            return next();
        }
    });
};

CigarDB.getCigars = function (req, res, next) {
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
        query_obj = {status: CigarDB.APPROVED},
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
        var err = new restify.MissingParameterError("You must supply at least one field.");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getCigars: Required parameter not provided');
        return next(err);
    }

    if (req.params.sort_field) {
        sort_field = req.params.sort_field;
        if (req.params.sort_direction && req.params.sort_direction == 'desc') {
            sort_field = '-' + sort_field;
        }
    }

    // Get a count of documents in this query to we can calculate number of pages later.
    Cigar.find(query_obj, 'name').count().exec().then(
        function (count) {
            doc_count = count;
            // Query that mofo!
            return Cigar.find(query_obj, limit_fields, {limit: limit, skip: skip}).sort(sort_field).lean().exec();
        }
    ).then(
        function (cigars) {
            if (cigars.length == 0) {
                throw new restify.ResourceNotFoundError("No records found!");
            } else {
                return_obj.numberOfPages = Math.floor(doc_count / limit);
                return_obj.currentPage = page;
                return_obj.data = [];
                for (var i = 0; cigars[i]; i++) {
                    var current_doc = {};
                    for (field in cigars[i]) {
                        // Remove Mongoose version field and rename MongoDB _id field for return
                        if (field == '__v') {
                            continue;
                        } else if (field == '_id') {
                            current_doc.id = cigars[i][field];
                        } else {
                            current_doc[field] = cigars[i][field];
                        }
                    }
                    return_obj.data.push(current_doc);
                }
                res.status(200);
                res.send(return_obj);
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: getCigars: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getCigars: ' + err.message);
            return next(err);
        });
};

CigarDB.getCigar = function (req, res, next) {
    // Return a single Cigar

    if (!req.params.id) {
        var err = new restify.MissingParameterError("You must supply an ID.");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getCigar: ID parameter not provided');
        return next(err);
    }

    Cigar.findOne({_id: req.params.id, status: CigarDB.APPROVED}, '').lean().exec(function (err, doc) {
        if (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getCigar: Query failed');
            return next(err);
        } else if (!doc) {
            var err = new restify.ResourceNotFoundError("Cigar not found.");
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getCigar: Query returned no documents');
            return next(err);
        } else {
            var return_obj = {data: {}};
            res.status(200);
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
            req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: getCigar: All clear');
            return next();
        }
    });
};
// TODO handle querying status (e.g.: admins looking for documents in the queue)

CigarDB.createCigar = function (req, res, next) {
    // Create a new Cigar entry (aka: Where the Magic Happens)
    // Minimum required fields are brand and name
    var
        return_obj = {data: {}, message: ''},
        cigar = new Cigar();

    for (param in req.params) {

        if (req.list_fields.indexOf(param) != -1) {
            req.params[param] = CigarDB.cleanEmptyList(req.params[param].split(','));
        }
        cigar[param] = req.params[param];
    }

    // Admins skip the queue
    if (req.access_level == 99) {
        cigar.status = CigarDB.APPROVED;
    } else {
        cigar.status = CigarDB.CREATE_PENDING;
    }

    // Let's make sure the brand they specified already exists. createCigar() is no place to createBrand()
    // Don't check status so that users can create brands and cigars together without waiting for brands to get approved.
    Brand.find({name: cigar.brand, $or: [
        {status: CigarDB.APPROVED},
        {status: CigarDB.CREATE_PENDING}
    ]}, 'name').exec().then(
        function (brands) {
            if (brands.length == 0) {
                throw new restify.ResourceNotFoundError("The Brand you specified was not found in the database. If you want to add a new brand and associated cigars, please create the brand first.");
            }
            // Mongoose.Model.save() doesn't return a promise! Lame!
            cigar.save(function (err, cigar) {
                if (err) {
                    throw new Error('Failed to save new cigar.')
                } else {
                    res.status(202);
                    return_obj.message = "The cigar has been created and is awaiting approval."
                    return_obj.data = {"id": cigar.id};
                    res.send(return_obj);
                    req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: createCigar: All clear');
                    return next();
                }
            });
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: createCigar: ' + err.message);
            return next(err);
        });
};

CigarDB.updateCigar = function (req, res, next) {

    if (!req.params.id) {
        var err = new restify.MissingParameterError("You must supply an ID.");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: updateCigar: ID parameter not provided');
        return next(err);
    }

    var update_req = new UpdateRequest();

    update_req.type = 'cigar';
    update_req.target_id = req.params.id;
    update_req.data = req.params;

    update_req.save(function (err, update_req) {
        if (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: updateCigar: Save failed');
            return next(err);
        } else {
            res.status(202);
            var data = {"message": "The update has been submitted and is awaiting approval."};
            res.send(data);
            req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: updateCigar: All clear');
            return next();
        }
    })
};


CigarDB.removeCigar = function (req, res, next) {

    var err;

    if (!req.params.id) {
        err = new restify.MissingParameterError('You must supply an ID.');
    } else if (!req.params.reason) {
        err = new restify.MissingParameterError('You must provide a reason.');
    }
    if (err) {
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: removeCigar: Required parameter not provided');
        return next(err);
    }

    var delete_req = new DeleteRequest();

    delete_req.target_id = req.params.id;
    delete_req.reason = req.params.reason;
    delete_req.type = 'cigar';

    delete_req.save(function (err, delete_req) {
        if (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: removeCigar: Save failed');
            return next(err);
        } else {
            res.status(202);
            var data = {"message": "The delete request has been submitted and is awaiting approval."};
            res.send(data);
            req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: removeCigar: All clear');
            return next();
        }
    });
};

CigarDB.getCigarsCreateRequests = function (req, res, next) {
    /*
     Return a list of all cigars with status 'create_pending'
     */
    var
        doc_count = 0,
        sort_field = 'updated',
        query_obj = {status: CigarDB.CREATE_PENDING},
        return_obj = {};

    // Moderators only!
    if (req.access_level < 99) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getCigarsCreateRequests: ' + err.message);
        return next(err);
    }

    if (req.params.sort_field) {
        sort_field = req.params.sort_field;
        if (req.params.sort_direction && req.params.sort_direction == 'desc') {
            sort_field = '-' + sort_field;
        }
    }

    // Get a count of documents in this query
    Cigar.find(query_obj, 'name').count().exec().then(
        function (count) {
            doc_count = count;
            // Query that mofo!
            return Cigar.find(query_obj).sort(sort_field).lean().exec();
        }
    ).then(
        function (cigars) {
            if (cigars.length == 0) {
                throw new restify.ResourceNotFoundError("No records found!");
            } else {
                return_obj.numberOfDocuments = doc_count;
                return_obj.data = [];
                for (var i = 0; cigars[i]; i++) {
                    var current_doc = {};
                    for (field in cigars[i]) {
                        // Remove Mongoose version field and rename MongoDB _id field for return
                        if (field == '__v') {
                            continue;
                        } else if (field == '_id') {
                            current_doc.id = cigars[i][field];
                        } else {
                            current_doc[field] = cigars[i][field];
                        }
                    }
                    return_obj.data.push(current_doc);
                }
                res.status(200);
                res.send(return_obj);
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: getCigarsCreateRequests: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getCigarsCreateRequests: ' + err.message);
            return next(err);
        });
};

CigarDB.log = bunyan.createLogger({
    name: 'cigardb',
    streams: [
        {level: 'info', type: 'raw', stream: new CigarDB.saveLog()}
    ],
    serializers: {
        req: bunyan.stdSerializers.req,
        err: bunyan.stdSerializers.err
    }
});

CigarDB.server = restify.createServer({
    name: 'CigarDB API',
    log: CigarDB.log,
    formatters: {
        'application/json; q=0.9': CigarDB.cigarDBFormatJSON
    }
});

// Set up our routes and start the server
CigarDB.server.use(restify.queryParser());
CigarDB.server.use(restify.bodyParser());
CigarDB.server.use(restify.gzipResponse());
CigarDB.server.use(restify.throttle({
    burst: 50,
    rate: 25,
    ip: true
}));

CigarDB.server.use(function (req, res, next) {
    // Verify the API Key and pass along the access level
    var
        theKey = req.params.api_key,
        cigar_fields = ['brand', 'name', 'vitola', 'color', 'fillers', 'wrappers', 'binders', 'strength', 'ring_gauge', 'length'],
        list_fields = ['wrappers', 'binders', 'fillers'],
        system_fields = ['api_key'],
        mongo_fields = ['__v', '_id'],
        attribute_domains = {};

    if (!theKey) {
        return next(new restify.MissingParameterError("API key missing."));
    }

    // Start promise chain.
    AttributeDomain.find().lean().exec()
        .then(
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
            req.api_key = apikey.api_key;
            req.access_level = apikey.access_level;
            req.cigar_fields = cigar_fields;
            req.list_fields = list_fields;
            req.attribute_domains = attribute_domains;
            req.system_fields = system_fields;
            return next();
        }
    ).then(null, function (err) {
            CigarDB.log.info(CigarDB.buildCustomLogFields(req, err), err.message);
            return next(err);
        }
    );
});

// Brand routes
CigarDB.server.get('/brands', CigarDB.getBrands);
CigarDB.server.get('/brands/:id', CigarDB.getBrand);
CigarDB.server.post('/brands', CigarDB.createBrand);
CigarDB.server.put('/brands/:id', CigarDB.updateBrand);
CigarDB.server.del('/brands/:id', CigarDB.removeBrand);

// Cigar routes
CigarDB.server.get('/cigars', CigarDB.getCigars);
CigarDB.server.get('/cigars/:id', CigarDB.getCigar);
CigarDB.server.post('/cigars', CigarDB.createCigar);
CigarDB.server.put('/cigars/:id', CigarDB.updateCigar);
CigarDB.server.del('/cigars/:id', CigarDB.removeCigar);

// Moderator routes
// Cigars
CigarDB.server.get('/moderate/cigarsCreateRequests', CigarDB.getCigarsCreateRequests);
//CigarDB.server.put('/moderate/cigarsCreateRequests/:id', CigarDB.approveCigarCreation);
//CigarDB.server.del('/moderate/cigarsCreateRequests/:id', CigarDB.denyCigarCreation);


CigarDB.server.on('uncaughtException', function (req, res, route, err) {
    req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: Uncaught Exception: ' + err.message);
    res.send(err);
});

CigarDB.server.listen(8080);
console.log('Server started...')