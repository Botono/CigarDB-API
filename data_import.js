var
    url = require('url'),
    mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    config = require('./config.js'),
//db = mongoose.connect(config.creds.mongoose_auth),
    schemas = require('./schema.js'),
    tmp_brands = require('./tmp_data/brands.js'),
    tmp_domains = require('./tmp_data/cigar_domain_values.js'),
    tmp_cigars = [],
    Brand = mongoose.model('Brand', schemas.BrandSchema),
    AttributeDomain = mongoose.model('AttributeDomain', schemas.AttributeDomainSchema),
    Cigar = mongoose.model('Cigar', schemas.CigarSchema),
    User = mongoose.model('User', schemas.UserSchema),
    App = mongoose.model('App', schemas.AppSchema),
    UpdateRequest = mongoose.model('UpdateRequest', schemas.UpdateRequestSchema),
    DeleteRequest = mongoose.model('DeleteRequest', schemas.DeleteRequestSchema);

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
            new_dom.color = tmp_domains.color;
            new_dom.country = tmp_domains.country;
            new_dom.fillers = tmp_domains.fillers;
            new_dom.strength = tmp_domains.strength;
            new_dom.wrappers = tmp_domains.wrappers;
            new_dom.vitola = tmp_domains.vitola;
            new_dom.save();
        }
    });
    Cigar.find().limit(1).exec(function (err, docs) {
        if (docs.length == 0) {
            console.log('LOADING CIGAR DATA');
            tmp_cigars[1] = require('./tmp_data/cigars1.js');
            tmp_cigars[2] = require('./tmp_data/cigars2.js');
            tmp_cigars[3] = require('./tmp_data/cigars3.js');
            tmp_cigars[4] = require('./tmp_data/cigars4.js');
            var total_cigars = 0;
            for (var i = 1; i <= 4; i++) {
                for (var j = 0; tmp_cigars[i][j]; j++) {
                    var curr_cigar = tmp_cigars[i][j];
                    if (curr_cigar['binder']) {
                        curr_cigar.binder = curr_cigar.binder.split(',');
                        curr_cigar.binder = clean_domain_values(curr_cigar.binder, tmp_domains.binders);
                    }
                    if (curr_cigar['filler']) {
                        curr_cigar.filler = curr_cigar.filler.split(',');
                        curr_cigar.filler = clean_domain_values(curr_cigar.filler, tmp_domains.fillers);
                    }
                    if (curr_cigar['wrapper']) {
                        curr_cigar.wrapper = curr_cigar.wrapper.split(',');
                        curr_cigar.wrapper = clean_domain_values(curr_cigar.wrapper, tmp_domains.wrappers);
                    }
                    var new_cigar = new Cigar();
                    new_cigar.name = curr_cigar.cigar_name;
                    new_cigar.brand = curr_cigar.brand;
                    new_cigar.color = curr_cigar.color;
                    new_cigar.length = curr_cigar.length;
                    new_cigar.ring_gauge = curr_cigar.ring_gauge;
                    new_cigar.wrappers = curr_cigar.wrapper;
                    new_cigar.fillers = curr_cigar.filler;
                    new_cigar.binders = curr_cigar.binder;
                    new_cigar.country = curr_cigar.country_manufactured;
                    new_cigar.strength = curr_cigar.strength;
                    new_cigar.vitola = curr_cigar.shape;
                    new_cigar.save(function (err, product) {
                        if (err) {
                            console.log('ERROR saving cigar: ' + JSON.stringify(new_cigar));
                        } else {
                            console.log('Saved cigar: ' + product.name);
                            total_cigars++;
                        }

                    });
                }
            }
        }
    })
}

function clean_domain_values(raw_data, valid_values) {
    if (!('contains' in String.prototype))
        String.prototype.contains = function (str, startIndex) {
            return -1 !== this.indexOf(str, startIndex);
        };
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

module.exports = populateDB;

