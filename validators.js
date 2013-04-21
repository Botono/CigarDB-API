var
    attr_domains = require('./tmp_data/cigar_domain_values.js'),
    validate = require('mongoose-validator').validate,
    validators = {};

validators.vitolaValidator = validate(
    {message: 'Invalid value for vitola.'},
    'isIn',
    attr_domains.vitola
);

validators.colorValidator = validate(
    {message: 'Invalid value for color.'},
    'isIn',
    attr_domains.color
);

validators.countryValidator = validate(
    {message: 'Invalid value for country.'},
    'isIn',
    attr_domains.country
);

validators.wrappersValidator = validate(
    {message: 'Invalid value for wrappers.',
        passIfEmpty: true},
    'isIn',
    attr_domains.wrappers
);

module.exports = validators;