var restify = require('restify'),
    url = require('url'),
    mongoose = require('mongoose'),
    config = require('./config'),
    db = mongoose.connect(config.creds.mongoose_auth),
    tmp_brands = require('./tmp_data/brands.js'),
    Schema = mongoose.Schema;

var BrandSchema = new Schema({
    name: String,
    location: String,
    founding_date: { type: Date, default: Date.now },
    logo: String, // Amazon S3?
    status: String,
    updated: Date
});
var Brand = mongoose.model('Brand', BrandSchema);

var CigarSchema = new Schema({
    brand: String, // Not an ID. Normalized
    name: String,
    length: Number,
    ring_gauge: Number,
    vitola: String,
    color: String,
    country: String,
    wrappers: [String],
    binders: [String],
    fillers: [String],
    year_introduced: Date,
    updated: { type: Date, default: Date.now },
    status: String
});
var Cigar = mongoose.model('Cigar', CigarSchema);

var UserSchema = new Schema({
    username: String,
    password: String, // hashed and whatnot
    email: String,
    github_access_token: String,
    date_joined: { type: Date, default: Date.now }
});
var User = mongoose.model('User', UserSchema);

var APIKeySchema = new Schema({
    api_key: String,
    access_level: Number,
    user_id: Schema.Types.ObjectId,
    date_created: { type: Date, default: Date.now }
});
APIKeySchema.index({api_key: 1, user_id: 1});
var APIKey = mongoose.model('APIKey', APIKeySchema);

// TODO figure out update/delete queue format
var UpdateRequestSchema = new Schema({
    type: String,
    target_type: String,
    date_submitted: { type: Date, default: Date.now },
    data: Schema.Types.Mixed
});
var UpdateRequest = mongoose.model('UpdateRequest', UpdateRequestSchema);

var DeleteRequestSchema = new Schema({
    type: String,
    date_submitted: { type: Date, default: Date.now },
    data: Schema.Types.Mixed
});
var DeleteRequest = mongoose.model('DeleteRequest', DeleteRequestSchema);

function getBrands(req, res, next) {
    // Return a list of all brands, paginated
    // Name parameter must be passed if not premium

    if (!req.params.name && req.access_level < 1) {
        return next(new restify.MissingParameterError("You must supply at least a name!"));
    }
    var limit = (req.access_level > 0) ? 9999 : 50,
        nameRegEx = new RegExp(req.params.name, 'i'),
        page = (req.params.page) ? req.params.page : 1,
        skip = (page > 1) ? page * 50 : 0;

    Brand.find({name: nameRegEx, status: 'approved'},'name', {limit: limit, skip: skip}).sort('name').exec(function(err, docs) {
        // TODO admins can query non-approved
        if (err) {
            return next(new restify.InternalError('FAIL'));
        } else if(docs.length == 0) {
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
        return next(new restify.MissingParameterError("You must supply an ID!"));
    }

    Brand.findOne({_id: req.params.id, status: 'approved'},'name location founding_date status updated').exec(function(err, docs) {
        if (err) {
           return next(new restify.InternalError('FAIL'));
        } else if(!docs) {
            return next(new restify.ResourceNotFoundError("Brand not found!"));
        } else {
            res.send(docs);
            return next();
        }

    });
}

function createBrand(req,res,next) {
    // Create a new Brand entry
    // Minimum required field is name
    if (!req.params.name) {
        return next(restify.InvalidContentError('You must supply at least a name!'));
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
            var data = [{"data":{"id": brand.id},"message": "The brand has been created and is awaiting approval."}];
            res.send(data);
            return next();
        }
    });

}

function updateBrand(req,res,next) {
    if (!req.params.id) {
        return next(restify.InvalidContentError('You must supply an ID!'));
    }
    update_req = new UpdateRequest();
    update_req.type = 'Brand';
    update_req.data = req.params;
    update_req.save(function (err,update_req) {
        if (err) {
            return next(err);
        } else {
            res.status(202);
            var data = [{"message": "The update has been submitted and is awaiting approval."}];
            res.send(data);
            console.log(update_req);
            return next();
        }
    })
}

var server = restify.createServer({
    name: 'CigarDB API'
})

function populateDB() {
    // brands
    User.find().exec(function(err,docs){
       if(docs.length == 0) {
           console.log('Adding users and keys');
           var new_user_id;
           var new_user = new User();
           new_user.username = 'aaron.murray';
           new_user.email = 'aaron.murray@cigardb.co';
           new_user.date_joined = new Date();
           new_user.save(function(err, new_user) {
                new_user_id = new_user.id;
           });
           var new_key = new APIKey();
           new_key.api_key = '2483f102-e4ae-4b41-b56f-e9e344ef9083';
           new_key.user_id = new_user_id;
           new_key.access_level = 99;
           new_key.date_created = new Date();
           new_key.save();
           var new_user = new User();
           new_user.username = 'developer_test';
           new_user.email = 'foo@bar.com';
           new_user.date_joined = new Date();
           new_user.save(function(err, new_user) {
               new_user_id = new_user.id;
           });
           var new_key = new APIKey();
           new_key.api_key = 'ca9e8600-ab8d-4181-940d-b57cd8277dab';
           new_key.user_id = new_user_id;
           new_key.access_level = 0;
           new_key.date_created = new Date();
           new_key.save();
           var new_user = new User();
           new_user.username = 'premium_test';
           new_user.email = 'bar@foo.com';
           new_user.date_joined = new Date();
           new_user.save(function(err, new_user) {
               new_user_id = new_user.id;
           });
           var new_key = new APIKey();
           new_key.api_key = '1f29f79b-7303-43b2-8bd1-6c5d5d4dc13d';
           new_key.user_id = new_user_id;
           new_key.access_level = 1;
           new_key.date_created = new Date();
           new_key.save();
       }
    });
    Brand.find().exec(function(err, docs) {
        if (docs.length == 0) {
            console.log('No brands found, populating Brands collection.');
            console.log(tmp_brands.length);
            for (var i=0;tmp_brands[i];i++) {
                var new_brand = new Brand();
                new_brand.name = tmp_brands[i];
                new_brand.status = 'approved';
                new_brand.updated = new Date();
                new_brand.save();
            }
        }
    });
}

// Set up our routes and start the server
server.use(restify.queryParser());
server.use(restify.bodyParser());

server.use(function(req,res,next){
    // Verify the API Key and pass along the access level
    var theKey = req.params.api_key;
    if (!theKey) {
        return next(new restify.MissingParameterError("API key missing."));
    }
    APIKey.find({api_key: theKey}, 'api_key access_level').exec(function(err,docs){
        if(err) {
            return next(new restify.InternalError("FAIL"));
        } else if(docs.length == 0) {
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
/*
server.delete('/brands/:id', removeBrand);

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