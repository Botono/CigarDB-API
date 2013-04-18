var
  url = require('url'),
  mongoose = require('mongoose'),
  Schema = mongoose.Schema,
  config = require('./config'),
  db = mongoose.connect(config.creds.mongoose_auth),
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

tmp_cigars[1] = require('./tmp_data/cigars1.js');
tmp_cigars[2] = require('./tmp_data/cigars2.js');
tmp_cigars[3] = require('./tmp_data/cigars3.js');
tmp_cigars[4] = require('./tmp_data/cigars4.js');

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

console.log('LOADING DATA');
var total_cigars = 0;
for (var i=1;i<=4;i++) {
  for (var j=0;tmp_cigars[i][j];j++) {
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
