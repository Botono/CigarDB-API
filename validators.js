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

module.exports = validators;