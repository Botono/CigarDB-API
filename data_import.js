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

console.log('CHECKING DATA');
for (var i=0;i<=4;i++) {
  console.log('===============================');
  console.log('Data Set '+ i + ': '+ tmp_cigars[i].length);
  console.log('===============================');
}