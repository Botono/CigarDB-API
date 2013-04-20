var
    mongoose = require('mongoose'),
    Schema = mongoose.Schema

var BrandSchema = new Schema({
    name: String,
    country: String,
    founding_date: { type: Date, default: Date.now },
    logo: String, // Amazon S3?
    address: String,
    location: {lat: Number, lng: Number },
    status: String,
    updated: Date
});
BrandSchema.index({location: "2d"});
BrandSchema.index({name: 1});

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
    strength: String,
    year_introduced: Date,
    updated: { type: Date, default: Date.now },
    status: String
});
CigarSchema.index({_id: 1, status: 1, brand: 1, name: 1});

var AttributeDomainSchema = new Schema({
    "binders": [String],
    "colors": [String],
    "countries": [String],
    "fillers": [String],
    "strengths": [String],
    "wrappers": [String],
    "vitolas": [String]
});

var UserSchema = new Schema({
    username: String,
    password: String, // hashed and whatnot
    email: String,
    github_access_token: String,
    date_joined: { type: Date, default: Date.now }
});

var AppSchema = new Schema({
    api_key: String,
    access_level: Number,
    user_id: Schema.Types.ObjectId,
    name: String,
    description: String,
    url: String,
    date_created: { type: Date, default: Date.now }
});
AppSchema.index({api_key: 1, user_id: 1});

var UpdateRequestSchema = new Schema({
    type: String,
    target_type: String,
    target_id: Schema.Types.ObjectId,
    date_submitted: { type: Date, default: Date.now },
    data: Schema.Types.Mixed
});
UpdateRequestSchema.index({target_id: -1});

var DeleteRequestSchema = new Schema({
    type: String,
    date_submitted: { type: Date, default: Date.now },
    target_id: Schema.Types.ObjectId,
    reason: String
});
DeleteRequestSchema.index({target_id: -1});

module.exports = {
    BrandSchema: BrandSchema,
    CigarSchema: CigarSchema,
    AttributeDomainSchema: AttributeDomainSchema,
    UserSchema: UserSchema,
    AppSchema: AppSchema,
    DeleteRequestSchema: DeleteRequestSchema,
    UpdateRequestSchema: UpdateRequestSchema
};