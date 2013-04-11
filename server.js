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
    founding_date: Date,
    logo: String, // Amazon S3?
    cigardb_status: String,
    cigardb_updated: Date
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
    cigardb_updated: Date,
    cigardb_status: String
});
var Cigar = mongoose.model('Cigar', CigarSchema);

var UserSchema = new Schema({
    username: String,
    password: String, // hashed and whatnot
    email: String,
    github_access_token: String,
    date_joined: Date
});
var User = mongoose.model('User', UserSchema);

var APIKeySchema = new Schema({
    api_key: String,
    access_level: String,
    user_id: Schema.Types.ObjectId,
    date_created: Date
});
var APIKey = mongoose.model('APIKey', APIKeySchema);


function getBrands(req, res, next) {
    // Return a list of all brands, paginated
    // Name parameter must be passed
    if (!req.params.name) {
        return next(new restify.MissingParameterError("You must supply at least a name!"));
    }
    var nameRegEx = new RegExp(req.params.name, 'i');
    Brand.find({name: nameRegEx },'name cigardb_status cigardb_updated').sort('name').exec(function(err, docs) {
         console.log(err);
         console.log(docs);
         res.send(docs);
         return next();

    });
}

var server = restify.createServer({
    name: 'CigarDB API'
})


function populateDB() {
    // brands
    console.log('Checking for data');
    Brand.find().exec(function(err, docs) {
        if (docs.length == 0) {
            console.log('No brands found, populating Brands collection.');
            console.log(tmp_brands.length);
            for (var i=0;tmp_brands[i];i++) {
                var new_brand = new Brand();
                new_brand.name = tmp_brands[i];
                new_brand.cigardb_status = 'approved';
                new_brand.cigardb_updated = new Date();
                new_brand.save();
            }
        }
    });
}

// Set up our routes and start the server
server.use(restify.queryParser());
server.use(restify.bodyParser());
// Brand Search: /brands?api_key=1234&name=Arturo
server.get('/brands', getBrands);


populateDB();
server.listen(8080);