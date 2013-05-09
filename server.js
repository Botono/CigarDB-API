var
    restify = require('restify'),
    url = require('url'),
    mongoose = require('mongoose'),
    bunyan = require('bunyan'),
    util = require('util'),
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
CigarDB.PENDING = 'pending';
CigarDB.DENIED = 'denied';
CigarDB.DELETED = 'deleted';
CigarDB.DEV_DAILY_LIMIT_REQUESTS = 500;
CigarDB.DEV_DAILY_LIMIT_HOURS = 24;
CigarDB.MODERATOR = 99;
CigarDB.PREMIUM = 10;
CigarDB.DEVELOPER = 0;

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

    var limit = (req.access_level > CigarDB.DEVELOPER) ? 0 : 50,
        page = (req.params.page) ? req.params.page : 1,
        skip = (page > 1) ? page * 50 : 0,
        options_obj = {skip: skip},
        return_obj = {message: '', data: []},
        query_obj = {status: CigarDB.APPROVED},
        doc_count = 0;

    if (limit > 0) {
        options_obj.limit = limit;
    }

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
        limit_fields = 'name location established website status updated',
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
        established = req.params.established || 0,
        brand = new Brand();

    if (req.access_level == CigarDB.MODERATOR) {
        // Admins skip the queue
        status = CigarDB.APPROVED;
    }
    brand.name = name;
    brand.status = status;
    brand.location = location;
    brand.established = established;
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

    var
        brand_updates = {};

    if (req.access_level === CigarDB.MODERATOR) {
        for (param in req.params) {
            brand_updates[param] = req.params[param];
        }
        brand_updates.updated = Date.now();
        Brand.findByIdAndUpdate(req.params.id, brand_updates).exec().then(function (updated_brand) {
            if (!updated_brand) {
                throw new Error('Brand update failed.');
            } else {
                res.status(200);
                var data = {"message": "The update has been processed."};
                res.send(data);
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: updateBrand MODERATOR: All clear');
                return next();
            }
        }).then(null, function (err) {
                req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: updateBrand MODERATOR: ' + err.message);
                return next(err);
            });
    } else {
        var update_req = new UpdateRequest();
        update_req.type = 'brand';
        update_req.api_key = req.api_key;
        update_req.data = req.params;
        update_req.status = CigarDB.PENDING;

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
    }
};

CigarDB.removeBrand = function (req, res, next) {

    var err;

    if (!req.params.id) {
        err = new restify.MissingParameterError('You must supply an ID.');
    } else if (!req.params.reason && req.access_level < CigarDB.MODERATOR) {
        err = new restify.MissingParameterError('You must provide a reason.');
    }
    if (err) {
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: removeBrand: Required parameter not provided');
        return next(err);
    }

    if (req.access_level == CigarDB.MODERATOR) {
        reason = req.params.reason || '';
        Brand.findByIdAndUpdate(req.params.id, {status: CigarDB.DELETED, reason: reason}).exec().then(function (removed_brand) {
            if (!removed_brand) {
                throw new Error('Brand update failed.');
            } else {
                res.status(200);
                data = {"message": "The brand was marked as deleted."};
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: removeBrand MODERATOR: All clear');
                return next();
            }
        }).then(null, function (err) {
                req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: removeBrand MODERATOR: ' + err.message);
                return next(err);
            }
        );
    } else {
        var delete_req = new DeleteRequest();
        delete_req.target_id = req.params.id;
        delete_req.reason = req.params.reason;
        delete_req.type = 'brand';
        delete_req.api_key = req.api_key;
        delete_req.status = CigarDB.PENDING;

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
    }


};

CigarDB.getCigars = function (req, res, next) {
    /*
     Return a list of all cigars, paginated
     User must filter by at least 1 field, unless they are premium.
     */
    var
        param_found = false,
        doc_count = 0,
        limit = (req.access_level > CigarDB.DEVELOPER) ? 9999 : 50,
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

    if (!param_found && req.access_level < CigarDB.PREMIUM) {
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
    if (req.access_level == CigarDB.MODERATOR) {
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

    var
        cigar_updates = {};

    if (!req.params.id) {
        var err = new restify.MissingParameterError("You must supply an ID.");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: updateCigar: ID parameter not provided');
        return next(err);
    }

    if (req.access_level === CigarDB.MODERATOR) {
        for (param in req.params) {
            if (req.list_fields.indexOf(param) != -1 && !util.isArray(req.params[param])) {
                req.params[param] = CigarDB.cleanEmptyList(req.params[param].split(','));
            }
            cigar_updates[param] = req.params[param];
        }
        cigar_updates.updated = Date.now();
        Cigar.findByIdAndUpdate(req.params.id, cigar_updates).exec().then(function (updated_cigar) {
            if (!updated_cigar) {
                throw new Error('Cigar update failed.');
            } else {
                res.status(200);
                var data = {"message": "The update has been processed."};
                res.send(data);
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: updateCigar MODERATOR: All clear');
                return next();
            }
        }).then(null, function (err) {
                req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: updateCigar MODERATOR: ' + err.message);
                return next(err);
            });
    } else {
        var update_req = new UpdateRequest();

        update_req.type = 'cigar';
        update_req.target_id = req.params.id;
        update_req.api_key = req.api_key;
        update_req.data = req.params;
        update_req.status = CigarDB.PENDING;

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
    }

};

CigarDB.removeCigar = function (req, res, next) {

    var
        err,
        reason,
        data = {};

    if (!req.params.id) {
        err = new restify.MissingParameterError('You must supply an ID.');
    } else if (!req.params.reason && req.access_level < CigarDB.MODERATOR) {
        err = new restify.MissingParameterError('You must provide a reason.');
    }
    if (err) {
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: removeCigar: Required parameter not provided');
        return next(err);
    }

    if (req.access_level == CigarDB.MODERATOR) {
        reason = req.params.reason || '';
        Cigar.findByIdAndUpdate(req.params.id, {status: CigarDB.DELETED, reason: reason}).exec().then(function (removed_cigar) {
            if (!removed_cigar) {
                throw new Error('Cigar update failed.');
            } else {
                res.status(200);
                data = {"message": "The cigar was marked as deleted."};
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: removeCigar MODERATOR: All clear');
                return next();
            }
        }).then(null, function (err) {
                req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: removeCigar MODERATOR: ' + err.message);
                return next(err);
            }
        );
    } else {
        var delete_req = new DeleteRequest();

        delete_req.target_id = req.params.id;
        delete_req.reason = req.params.reason;
        delete_req.api_key = req.api_key;
        delete_req.type = 'cigar';
        delete_req.status = CigarDB.PENDING;

        delete_req.save(function (err, delete_req) {
            if (err) {
                req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: removeCigar: Save failed');
                return next(err);
            } else {
                res.status(202);
                data = {"message": "The delete request has been submitted and is awaiting approval."};
                res.send(data);
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: removeCigar: All clear');
                return next();
            }
        });
    }


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
    if (req.access_level < CigarDB.MODERATOR) {
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

CigarDB.approveCigarCreation = function (req, res, next) {
    // Approve a create cigar request
    var
        return_obj = {data: {}, message: ''},
        cigar = {};

    for (param in req.params) {
        if (req.list_fields.indexOf(param) != -1) {
            req.params[param] = CigarDB.cleanEmptyList(req.params[param].split(','));
        }
        cigar[param] = req.params[param];
    }

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: approveCigarCreation: ' + err.message);
        return next(err);
    } else {
        cigar.status = CigarDB.APPROVED;
    }

    // Let's make sure the brand they specified already exists.
    Brand.find({name: cigar.brand, status: CigarDB.APPROVED}, 'name').exec().then(
        function (brands) {
            if (brands.length == 0) {
                throw new restify.ResourceNotFoundError("The Brand you specified was not found in the database. If you want to add a new brand and associated cigars, please create the brand first.");
            }
            return Cigar.update({_id: req.params.id}, cigar).exec();
        }
    ).then(
        function (numberAffected, raw) {
            if (numberAffected != 1) {
                throw new restify.ResourceNotFoundError('No records where updated (Check your query).');
            } else {
                res.status(200);
                return_obj.message = 'Cigar approved!';
                return_obj.data = raw;
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: approveCigarCreation: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: approveCigarCreation: ' + err.message);
            return next(err);
        });
};

CigarDB.denyCigarCreation = function (req, res, next) {
    // Deny a create cigar request
    var
        return_obj = {data: {}, message: ''},
        cigar = {moderator_notes: req.params.moderator_notes};

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: denyCigarCreation: ' + err.message);
        return next(err);
    } else {
        cigar.status = CigarDB.DENIED;
    }

    Cigar.update({_id: req.params.id}, cigar).exec().then(
        function (numberAffected, raw) {
            if (numberAffected != 1) {
                throw new restify.ResourceNotFoundError('No records where updated (Check your query).');
            } else {
                res.status(200);
                return_obj.message = 'Cigar denied!';
                return_obj.data = raw;
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: denyCigarCreation: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: denyCigarCreation: ' + err.message);
            return next(err);
        });
};

CigarDB.getCigarsUpdateRequests = function (req, res, next) {
    /*
     Return a list of all cigars update requests
     */
    var
        doc_count = 0,
        sort_field = 'date_submitted',
        query_obj = {type: 'cigar', status: CigarDB.PENDING},
        return_obj = {};

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getCigarsUpdateRequests: ' + err.message);
        return next(err);
    }

    if (req.params.sort_field) {
        sort_field = req.params.sort_field;
        if (req.params.sort_direction && req.params.sort_direction == 'desc') {
            sort_field = '-' + sort_field;
        }
    }

    // Get a count of documents in this query
    UpdateRequest.find(query_obj, 'name').count().exec().then(
        function (count) {
            doc_count = count;
            // Query that mofo!
            return UpdateRequest.find(query_obj).sort(sort_field).lean().exec();
        }
    ).then(
        function (update_reqs) {
            if (update_reqs.length == 0) {
                throw new restify.ResourceNotFoundError("No records found!");
            } else {
                return_obj.numberOfDocuments = doc_count;
                return_obj.data = [];
                for (var i = 0; update_reqs[i]; i++) {
                    var current_doc = {};
                    for (field in update_reqs[i]) {
                        // Remove Mongoose version field and rename MongoDB _id field for return
                        if (field == '__v') {
                            continue;
                        } else if (field == '_id') {
                            current_doc.id = update_reqs[i][field];
                        } else {
                            current_doc[field] = update_reqs[i][field];
                        }
                    }
                    return_obj.data.push(current_doc);
                }
                res.status(200);
                res.send(return_obj);
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: getCigarsUpdateRequests: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getCigarsUpdateRequests: ' + err.message);
            return next(err);
        });
};

CigarDB.approveCigarUpdate = function (req, res, next) {
    // Approve an update cigar request
    var
        return_obj = {data: {}, message: ''},
        mod_changes = {};

    for (param in req.params) {
        if (req.list_fields.indexOf(param) != -1) {
            req.params[param] = CigarDB.cleanEmptyList(req.params[param].split(','));
        }
        mod_changes[param] = req.params[param];
    }

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: approveCigarUpdate: ' + err.message);
        return next(err);
    } else {
        mod_changes.status = CigarDB.APPROVED;
    }

    UpdateRequest.findByIdAndUpdate(req.params.id, {status: CigarDB.APPROVED}).exec().then(
        function (update_req) {
            if (!update_req) {
                throw new restify.ResourceNotFoundError('Update request was not archived (Check your query).');
            } else {
                return Cigar.update({_id: mod_changes.target_id}, mod_changes).exec();
            }
        }
    ).then(
        function (numberAffected, raw) {
            if (numberAffected != 1) {
                throw new restify.ResourceNotFoundError('No records where updated (Check your query).');
            } else {
                res.status(200);
                return_obj.message = 'Cigar update approved!';
                return_obj.data = raw;
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: approveCigarUpdate: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: approveCigarUpdate: ' + err.message);
            return next(err);
        });
};

CigarDB.denyCigarUpdate = function (req, res, next) {
    // Deny an update cigar request
    var
        return_obj = {data: {}, message: ''},
        update_req = {
            moderator_notes: req.params.moderator_notes,
            status: CigarDB.DENIED
        };

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: denyCigarUpdate: ' + err.message);
        return next(err);
    }

    UpdateRequest.update({_id: req.params.id}, update_req).exec().then(
        function (numberAffected, raw) {
            if (numberAffected != 1) {
                throw new restify.ResourceNotFoundError('No records where updated (Check your query).');
            } else {
                res.status(200);
                return_obj.message = 'Cigar update denied!';
                return_obj.data = raw;
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: denyCigarUpdate: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: denyCigarUpdate: ' + err.message);
            return next(err);
        });
};

CigarDB.getCigarsDeleteRequests = function (req, res, next) {
    /*
     Return a list of all cigars delete requests
     */
    var
        doc_count = 0,
        sort_field = 'date_submitted',
        query_obj = {type: 'cigar', status: CigarDB.PENDING},
        return_obj = {};

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getCigarsDeleteRequests: ' + err.message);
        return next(err);
    }

    if (req.params.sort_field) {
        sort_field = req.params.sort_field;
        if (req.params.sort_direction && req.params.sort_direction === 'desc') {
            sort_field = '-' + sort_field;
        }
    }

    // Get a count of documents in this query
    DeleteRequest.find(query_obj, 'name').count().exec().then(
        function (count) {
            doc_count = count;
            // Query that mofo!
            return DeleteRequest.find(query_obj).sort(sort_field).lean().exec();
        }
    ).then(
        function (delete_reqs) {
            if (delete_reqs.length == 0) {
                throw new restify.ResourceNotFoundError("No records found!");
            } else {
                return_obj.numberOfDocuments = doc_count;
                return_obj.data = [];
                for (var i = 0; delete_reqs[i]; i++) {
                    var current_doc = {};
                    for (field in delete_reqs[i]) {
                        // Remove Mongoose version field and rename MongoDB _id field for return
                        if (field == '__v') {
                            continue;
                        } else if (field == '_id') {
                            current_doc.id = delete_reqs[i][field];
                        } else {
                            current_doc[field] = delete_reqs[i][field];
                        }
                    }
                    return_obj.data.push(current_doc);
                }
                res.status(200);
                res.send(return_obj);
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: getCigarsDeleteRequests: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getCigarsDeleteRequests: ' + err.message);
            return next(err);
        });
};

CigarDB.approveCigarDelete = function (req, res, next) {
    // Approve a delete cigar request
    var
        return_obj = {data: {}, message: ''},
        mod_changes = {status: CigarDB.DELETED};

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: approveCigarDelete: ' + err.message);
        return next(err);
    }

    DeleteRequest.findByIdAndUpdate(req.params.id, {status: CigarDB.APPROVED}).exec().then(
        function (delete_req) {
            if (!delete_req) {
                throw new restify.ResourceNotFoundError('Delete request was not archived (Check your query).');
            } else {
                return Cigar.update({_id: delete_req.target_id}, mod_changes).exec();
            }
        }
    ).then(
        function (numberAffected, raw) {
            if (numberAffected != 1) {
                throw new restify.ResourceNotFoundError('No records where updated (Check your query).');
            } else {
                res.status(200);
                return_obj.message = 'Cigar delete approved!';
                return_obj.data = raw;
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: approveCigarDelete: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: approveCigarDelete: ' + err.message);
            return next(err);
        });
};

CigarDB.denyCigarDelete = function (req, res, next) {
    // Deny an update cigar request
    var
        return_obj = {data: {}, message: ''},
        delete_req = {
            moderator_notes: req.params.moderator_notes,
            status: CigarDB.DENIED
        };

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: denyCigarDelete: ' + err.message);
        return next(err);
    }

    DeleteRequest.update({_id: req.params.id}, delete_req).exec().then(
        function (numberAffected, raw) {
            if (numberAffected != 1) {
                throw new restify.ResourceNotFoundError('No records where updated (Check your query).');
            } else {
                res.status(200);
                return_obj.message = 'Cigar delete request denied!';
                return_obj.data = raw;
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: denyCigarDelete: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: denyCigarDelete: ' + err.message);
            return next(err);
        });
};

CigarDB.getBrandsCreateRequests = function (req, res, next) {
    /*
     Return a list of all brands with status 'create_pending'
     */
    var
        doc_count = 0,
        sort_field = 'updated',
        query_obj = {status: CigarDB.CREATE_PENDING},
        return_obj = {};

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getBrandsCreateRequests: ' + err.message);
        return next(err);
    }

    if (req.params.sort_field) {
        sort_field = req.params.sort_field;
        if (req.params.sort_direction && req.params.sort_direction == 'desc') {
            sort_field = '-' + sort_field;
        }
    }

    // Get a count of documents in this query
    Brand.find(query_obj, 'name').count().exec().then(
        function (count) {
            doc_count = count;
            // Query that mofo!
            return Brand.find(query_obj).sort(sort_field).lean().exec();
        }
    ).then(
        function (brands) {
            if (brands.length == 0) {
                throw new restify.ResourceNotFoundError("No records found!");
            } else {
                return_obj.numberOfDocuments = doc_count;
                return_obj.data = [];
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
                res.status(200);
                res.send(return_obj);
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: getBrandsCreateRequests: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getBrandsCreateRequests: ' + err.message);
            return next(err);
        });
};

CigarDB.approveBrandCreation = function (req, res, next) {
    // Approve a create cigar request
    var
        return_obj = {data: {}, message: ''},
        brand_obj = {};

    for (param in req.params) {
        if (req.list_fields.indexOf(param) != -1) {
            req.params[param] = CigarDB.cleanEmptyList(req.params[param].split(','));
        }
        brand_obj[param] = req.params[param];
    }

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: approveBrandCreation: ' + err.message);
        return next(err);
    } else {
        brand_obj.status = CigarDB.APPROVED;
    }

    Brand.update({_id: req.params.id}, brand_obj).exec().then(
        function (numberAffected, raw) {
            if (numberAffected != 1) {
                throw new restify.ResourceNotFoundError('No records where updated (Check your query).');
            } else {
                res.status(200);
                return_obj.message = 'Brand approved!';
                return_obj.data = raw;
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: approveBrandCreation: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: approveBrandCreation: ' + err.message);
            return next(err);
        });
};

CigarDB.denyBrandCreation = function (req, res, next) {
    // Deny a create brand request
    var
        return_obj = {data: {}, message: ''},
        brand_obj = {
            moderator_notes: req.params.moderator_notes,
            status: CigarDB.DENIED
        };

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: denyBrandCreation: ' + err.message);
        return next(err);
    }

    Brand.findByIdAndUpdate(req.params.id, brand_obj).exec().then(
        function (brand_updated) {
            if (!brand_updated) {
                throw new restify.ResourceNotFoundError('No records where updated (Check your query).');
            } else {
                // Might as well deny any cigars that were added along with this brand!
                return Cigar.update({brand: brand_updated.name}, {status: CigarDB.DENIED}, {multi: true}).exec();
            }
        }
    ).then(
        function (numberUpdated, raw) {
            res.status(200);
            return_obj.message = 'Brand creation denied!';
            if (numberUpdated > 0) {
                return_obj.message += ' (Also denied ' + numberUpdated + ' cigars that used this brand.)';
            }
            return_obj.data = raw;
            req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: denyBrandCreation: All clear');
            return next();
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: denyBrandCreation: ' + err.message);
            return next(err);
        });
};

CigarDB.getBrandsUpdateRequests = function (req, res, next) {
    /*
     Return a list of all brands update requests
     */
    var
        doc_count = 0,
        sort_field = 'date_submitted',
        query_obj = {type: 'brand', status: CigarDB.PENDING},
        return_obj = {};

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getBrandsUpdateRequests: ' + err.message);
        return next(err);
    }

    if (req.params.sort_field) {
        sort_field = req.params.sort_field;
        if (req.params.sort_direction && req.params.sort_direction == 'desc') {
            sort_field = '-' + sort_field;
        }
    }

    // Get a count of documents in this query
    UpdateRequest.find(query_obj, 'name').count().exec().then(
        function (count) {
            doc_count = count;
            // Query that mofo!
            return UpdateRequest.find(query_obj).sort(sort_field).lean().exec();
        }
    ).then(
        function (update_reqs) {
            if (update_reqs.length == 0) {
                throw new restify.ResourceNotFoundError("No records found!");
            } else {
                return_obj.numberOfDocuments = doc_count;
                return_obj.data = [];
                for (var i = 0; update_reqs[i]; i++) {
                    var current_doc = {};
                    for (field in update_reqs[i]) {
                        // Remove Mongoose version field and rename MongoDB _id field for return
                        if (field == '__v') {
                            continue;
                        } else if (field == '_id') {
                            current_doc.id = update_reqs[i][field];
                        } else {
                            current_doc[field] = update_reqs[i][field];
                        }
                    }
                    return_obj.data.push(current_doc);
                }
                res.status(200);
                res.send(return_obj);
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: getBrandsUpdateRequests: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getBrandsUpdateRequests: ' + err.message);
            return next(err);
        });
};

CigarDB.approveBrandUpdate = function (req, res, next) {
    // Approve an update brand request
    var
        return_obj = {data: {}, message: ''},
        mod_changes = {
            status: CigarDB.APPROVED
        };

    for (param in req.params) {
        mod_changes[param] = req.params[param];
    }

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: approveBrandUpdate: ' + err.message);
        return next(err);
    }

    UpdateRequest.findByIdAndUpdate(req.params.id, {status: CigarDB.APPROVED}).exec().then(
        function (update_req) {
            if (!update_req) {
                throw new restify.ResourceNotFoundError('Update request was not archived (Check your query).');
            } else {
                return Brand.update({_id: mod_changes.target_id}, mod_changes).exec();
            }
        }
    ).then(
        function (numberAffected, raw) {
            if (numberAffected != 1) {
                throw new restify.ResourceNotFoundError('No records where updated (Check your query).');
            } else {
                res.status(200);
                return_obj.message = 'Brand update approved!';
                return_obj.data = raw;
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: approveBrandUpdate: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: approveBrandUpdate: ' + err.message);
            return next(err);
        });
};

CigarDB.denyBrandUpdate = function (req, res, next) {
    // Deny an update brand request
    var
        return_obj = {data: {}, message: ''},
        update_req = {
            moderator_notes: req.params.moderator_notes,
            status: CigarDB.DENIED
        };

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: denyBrandUpdate: ' + err.message);
        return next(err);
    }

    UpdateRequest.update({_id: req.params.id}, update_req).exec().then(
        function (numberAffected, raw) {
            if (numberAffected != 1) {
                throw new restify.ResourceNotFoundError('No records where updated (Check your query).');
            } else {
                res.status(200);
                return_obj.message = 'Brand update denied!';
                return_obj.data = raw;
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: denyBrandUpdate: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: denyBrandUpdate: ' + err.message);
            return next(err);
        });
};

CigarDB.getBrandsDeleteRequests = function (req, res, next) {
    /*
     Return a list of all brands delete requests
     */
    var
        doc_count = 0,
        sort_field = 'date_submitted',
        query_obj = {type: 'brand', status: CigarDB.PENDING},
        return_obj = {};

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getBrandsDeleteRequests: ' + err.message);
        return next(err);
    }

    if (req.params.sort_field) {
        sort_field = req.params.sort_field;
        if (req.params.sort_direction && req.params.sort_direction === 'desc') {
            sort_field = '-' + sort_field;
        }
    }

    // Get a count of documents in this query
    DeleteRequest.find(query_obj, 'name').count().exec().then(
        function (count) {
            doc_count = count;
            // Query that mofo!
            return DeleteRequest.find(query_obj).sort(sort_field).lean().exec();
        }
    ).then(
        function (delete_reqs) {
            if (delete_reqs.length == 0) {
                throw new restify.ResourceNotFoundError("No records found!");
            } else {
                return_obj.numberOfDocuments = doc_count;
                return_obj.data = [];
                for (var i = 0; delete_reqs[i]; i++) {
                    var current_doc = {};
                    for (field in delete_reqs[i]) {
                        // Remove Mongoose version field and rename MongoDB _id field for return
                        if (field == '__v') {
                            continue;
                        } else if (field == '_id') {
                            current_doc.id = delete_reqs[i][field];
                        } else {
                            current_doc[field] = delete_reqs[i][field];
                        }
                    }
                    return_obj.data.push(current_doc);
                }
                res.status(200);
                res.send(return_obj);
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: getBrandsDeleteRequests: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getBrandsDeleteRequests: ' + err.message);
            return next(err);
        });
};

CigarDB.approveBrandDelete = function (req, res, next) {
    // Approve a delete cigar request
    var
        return_obj = {
            data: {},
            message: ''
        },
        mod_changes = {
            status: CigarDB.DELETED
        };

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: approveBrandDelete: ' + err.message);
        return next(err);
    }

    DeleteRequest.findByIdAndUpdate(req.params.id, {status: CigarDB.APPROVED}).exec().then(
        function (delete_req) {
            if (!delete_req) {
                throw new restify.ResourceNotFoundError('Delete request was not archived (Check your query).');
            } else {
                return Brand.update({_id: delete_req.target_id}, mod_changes).exec();
            }
        }
    ).then(
        function (numberAffected, raw) {
            if (numberAffected != 1) {
                throw new restify.ResourceNotFoundError('No records where updated (Check your query).');
            } else {
                res.status(200);
                return_obj.message = 'Brand delete approved!';
                return_obj.data = raw;
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: approveBrandDelete: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: approveBrandDelete: ' + err.message);
            return next(err);
        });
};

CigarDB.denyBrandDelete = function (req, res, next) {
    // Deny an update brand request
    var
        return_obj = {data: {}, message: ''},
        delete_req = {
            moderator_notes: req.params.moderator_notes,
            status: CigarDB.DENIED
        };

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: denyBrandDelete: ' + err.message);
        return next(err);
    }

    DeleteRequest.update({_id: req.params.id}, delete_req).exec().then(
        function (numberAffected, raw) {
            if (numberAffected != 1) {
                throw new restify.ResourceNotFoundError('No records where updated (Check your query).');
            } else {
                res.status(200);
                return_obj.message = 'Brand delete request denied!';
                return_obj.data = raw;
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: denyBrandDelete: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: denyBrandDelete: ' + err.message);
            return next(err);
        });
};

CigarDB.getBrandToClean = function (req, res, next) {
    /*
     Return a single Brand that has not been cleaned
     */
    var
        doc_count = 0,
        sort_field = 'name',
        query_obj = {cleaned: false},
        return_obj = {};

    // Moderators only!
    if (req.access_level < CigarDB.MODERATOR) {
        var err = new restify.NotAuthorizedError("You are not authorized!");
        req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getBrandToClean: ' + err.message);
        return next(err);
    }

    Brand.findOne(query_obj).sort(sort_field).lean().exec().then(
        function (brand) {
            if (!brand) {
                throw new restify.ResourceNotFoundError("No records found!");
            } else {
                return_obj.data = {};

                for (field in brand) {
                    // Remove Mongoose version field and rename MongoDB _id field for return
                    if (field == '__v') {
                        continue;
                    } else if (field == '_id') {
                        return_obj.data.id = brand[field];
                    } else {
                        return_obj.data[field] = brand[field];
                    }
                }

                res.status(200);
                res.send(return_obj);
                req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: getBrandToClean: All clear');
                return next();
            }
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getBrandToClean: ' + err.message);
            return next(err);
        });
};

CigarDB.getDomainValues = function (req, res, next) {
    // Return cigar domain values

    var attribute_domains = {data: {}};

    AttributeDomain.find().lean().exec()
        .then(
        function (attrdomains) {
            for (param in attrdomains[0]) {
                if (req.mongo_fields.indexOf(param) == -1) {
                    attribute_domains.data[param] = attrdomains[0][param];
                }
            }
            res.status(200);
            res.send(attribute_domains);
            req.log.info(CigarDB.buildCustomLogFields(req), 'SUCCESS: getDomainValues: All clear');
            return next();
        }
    ).then(null, function (err) {
            req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: getDomainValues: ' + err.message);
            return next(err);
        }
    );

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
    burst: 25,
    rate: 15,
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
        time_since_last_accessed = 0,
        app_update_obj = {};

    if (!theKey) {
        return next(new restify.MissingParameterError("API key missing."));
    }

    App.findOne({api_key: theKey}, 'api_key access_level last_used access_count').exec().then(
        function (apikey) {
            if (!apikey) {
                throw new Error("API key not found!");
            }
            time_since_last_accessed = (Date.now() - apikey.last_used) / 1000 / 60 / 60; // in hours
            if (time_since_last_accessed > CigarDB.DEV_DAILY_LIMIT_HOURS) {
                app_update_obj = {
                    last_used: Date.now(),
                    access_count: 1
                }
            } else {
                app_update_obj = {
                    access_count: ++apikey.access_count
                }
            }
            return App.findOneAndUpdate({api_key: theKey}, app_update_obj).exec();
        }
    ).then(function (apikey) {
            if (!apikey) {
                throw new Error("API key update failed!");
            } else if (apikey.access_level < CigarDB.PREMIUM) {
                if (time_since_last_accessed < CigarDB.DEV_DAILY_LIMIT_HOURS && apikey.access_count > CigarDB.DEV_DAILY_LIMIT_REQUESTS) {
                    throw new Error("You have exceeded the daily limit of requests for this API Key. Please encourage the authors of this app to upgrade their CigarDB API Key.");
                }
            }
            req.api_key = apikey.api_key;
            req.access_level = apikey.access_level;
            req.cigar_fields = cigar_fields;
            req.list_fields = list_fields;
            req.system_fields = system_fields;
            req.mongo_fields = mongo_fields;
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

CigarDB.server.get('/cigarDomainValues', CigarDB.getDomainValues);

// Moderator routes
// Cigars - Create Requests
CigarDB.server.get('/moderate/cigarsCreateRequests', CigarDB.getCigarsCreateRequests);
CigarDB.server.put('/moderate/cigarsCreateRequests/:id', CigarDB.approveCigarCreation);
CigarDB.server.del('/moderate/cigarsCreateRequests/:id', CigarDB.denyCigarCreation);
// Cigars - Update Requests
CigarDB.server.get('/moderate/cigarsUpdateRequests', CigarDB.getCigarsUpdateRequests);
CigarDB.server.put('/moderate/cigarsUpdateRequests/:id', CigarDB.approveCigarUpdate);
CigarDB.server.del('/moderate/cigarsUpdateRequests/:id', CigarDB.denyCigarUpdate);
// Cigars - Delete Requests
CigarDB.server.get('/moderate/cigarsDeleteRequests', CigarDB.getCigarsDeleteRequests);
CigarDB.server.put('/moderate/cigarsDeleteRequests/:id', CigarDB.approveCigarDelete);
CigarDB.server.del('/moderate/cigarsDeleteRequests/:id', CigarDB.denyCigarDelete);

// Brands - Create Requests
CigarDB.server.get('/moderate/brandsCreateRequests', CigarDB.getBrandsCreateRequests);
CigarDB.server.put('/moderate/brandsCreateRequests/:id', CigarDB.approveBrandCreation);
CigarDB.server.del('/moderate/brandsCreateRequests/:id', CigarDB.denyBrandCreation);
// Brands - Update Requests
CigarDB.server.get('/moderate/brandsUpdateRequests', CigarDB.getBrandsUpdateRequests);
CigarDB.server.put('/moderate/brandsUpdateRequests/:id', CigarDB.approveBrandUpdate);
CigarDB.server.del('/moderate/brandsUpdateRequests/:id', CigarDB.denyBrandUpdate);
// Brands - Delete Requests
CigarDB.server.get('/moderate/brandsDeleteRequests', CigarDB.getBrandsDeleteRequests);
CigarDB.server.put('/moderate/brandsDeleteRequests/:id', CigarDB.approveBrandDelete);
CigarDB.server.del('/moderate/brandsDeleteRequests/:id', CigarDB.denyBrandDelete);

// Route for data cleanup
CigarDB.server.get('/cleanup/getBrandToClean', CigarDB.getBrandToClean);

CigarDB.server.on('uncaughtException', function (req, res, route, err) {
    req.log.info(CigarDB.buildCustomLogFields(req, err), 'ERROR: Uncaught Exception: ' + err.message);
    res.send(err);
});

CigarDB.server.listen(8080);
console.log('Server started...')