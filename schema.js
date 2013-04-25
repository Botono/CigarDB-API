var
    mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    validators = require('./validators.js');


var BrandSchema = new Schema({
    name: {type: String, required: true},
    country: {type: String, validate: validators.countryValidator},
    founding_date: { type: Date },
    logo: String, // Amazon S3?
    address: String,
    location: {lat: Number, lng: Number },
    website: {type: String, validate: validators.URLValidator},
    status: String,
    updated: Date
});
BrandSchema.index({location: "2d"});
BrandSchema.index({name: 1});

var CigarSchema = new Schema({
    brand: {type: String, required: true}, // Not an ID. Normalized
    name: {type: String, required: true},
    length: Number,
    ring_gauge: Number,
    vitola: {type: String, validate: validators.vitolaValidator},
    color: {type: String, validate: validators.colorValidator},
    country: {type: String, validate: validators.countryValidator},
    wrappers: {type: [String], validate: validators.wrappersValidator},
    binders: {type: [String], validate: validators.bindersValidator},
    fillers: {type: [String], validate: validators.fillersValidator},
    strength: {type: String, validate: validators.strengthValidator},
    year_introduced: Date,
    updated: { type: Date, default: Date.now },
    status: String
});
CigarSchema.index({_id: 1, status: 1, brand: 1, name: 1});

var AttributeDomainSchema = new Schema({
    "binders": [String],
    "color": [String],
    "country": [String],
    "fillers": [String],
    "strength": [String],
    "wrappers": [String],
    "vitola": [String],
    "updated": {type: Date, default: Date.now }
});

var UserSchema = new Schema({
    username: String,
    password: String, // hashed and whatnot
    email: String,
    github_access_token: String,
    date_joined: { type: Date, default: Date.now }
});

var AppSchema = new Schema({
    api_key: {type: String, required: true},
    access_level: {type: Number, min: 0, max: 99},
    user_id: Schema.Types.ObjectId,
    name: String,
    description: String,
    url: String,
    date_created: { type: Date, default: Date.now }
});
AppSchema.index({api_key: 1, user_id: 1});

var UpdateRequestSchema = new Schema({
    type: {type: String, required: true},
    target_id: {type: Schema.Types.ObjectId, required: true},
    date_submitted: { type: Date, default: Date.now },
    data: Schema.Types.Mixed
});
UpdateRequestSchema.index({target_id: -1});

var DeleteRequestSchema = new Schema({
    type: {type: String, required: true},
    target_id: {type: Schema.Types.ObjectId, required: true},
    date_submitted: { type: Date, default: Date.now },
    reason: {type: String, required: true}
});
DeleteRequestSchema.index({target_id: -1});

var LogSchema = new Schema({
    name: String,
    hostname: String,
    pid: Number,
    level: Number,
    lang: String,
    msg: String,
    time: {type: Date},
    v: Number,
    api_key: String,
    req: Schema.Types.Mixed,
    err: Schema.Types.Mixed,
    params: Schema.Types.Mixed
});
LogSchema.index({api_key: 1, time: -1});

module.exports = {
    BrandSchema: BrandSchema,
    CigarSchema: CigarSchema,
    AttributeDomainSchema: AttributeDomainSchema,
    UserSchema: UserSchema,
    AppSchema: AppSchema,
    DeleteRequestSchema: DeleteRequestSchema,
    UpdateRequestSchema: UpdateRequestSchema,
    LogSchema: LogSchema
};