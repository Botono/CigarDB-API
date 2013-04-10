var restify = require('restify'),
    mongoose = require('mongoose'),
    config = require('./config'),
    db = mongoose.connect(config.creds.mongoose_auth),
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
     Brand.find().sort('name').exec(function (data) {
         res.send(data);
     })
}

var server = restify.createServer({
    name: 'CigarDB API'
})

server.listen(8080);
// Set up our routes and start the server
server.get('/brands', getBrands);
