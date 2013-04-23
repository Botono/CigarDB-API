var
    attr_domains = require('./tmp_data/cigar_domain_values.js'),
    util = require('util'),
    validators = {};

validators.vitolaValidator = {
    validator: function (val) {
        return checkAgainstDomainVals(val, attr_domains.vitola);
    },
    msg: 'Value for vitola is invalid.'
};

validators.colorValidator = {
    validator: function (val) {
        return checkAgainstDomainVals(val, attr_domains.color);
    },
    msg: 'Value for color is invalid.'
};

validators.countryValidator = {
    validator: function (val) {
        return checkAgainstDomainVals(val, attr_domains.country);
    },
    msg: 'Value for country is invalid.'
};

validators.strengthValidator = {
    validator: function (val) {
        return checkAgainstDomainVals(val, attr_domains.strength);
    },
    msg: 'Value for strength is invalid.'
};


validators.wrappersValidator = {
    validator: function (val) {
        return checkAgainstDomainVals(val, attr_domains.wrappers);
    },
    msg: 'Value for wrappers is invalid.'
};

validators.bindersValidator = {
    validator: function (val) {
        return checkAgainstDomainVals(val, attr_domains.binders);
    },
    msg: 'Value for binders is invalid.'
};

validators.fillersValidator = {
    validator: function (val) {
        return checkAgainstDomainVals(val, attr_domains.fillers);
    },
    msg: 'Value for fillers is invalid.'
};

validators.URLValidator = {
    validator: function (val) {
        try {
            check(val).isUrl();
        } catch (e) {
            return false;
        }
        return true;
    },
    msg: 'URL is not valid.'
};

function checkAgainstDomainVals(the_val, truth) {
    if (util.isArray(the_val)) {
        console.log(util.inspect(the_val));
        if (the_val.length > 0) {
            for (var i = 0; the_val[i]; i++) {
                if (truth.indexOf(the_val[i]) == -1) {
                    return false;
                }
            }
        }
        return true;
    } else {
        if (truth.indexOf(the_val) == -1) {
            return false;
        }
        return true;
    }
    return false;
}


module.exports = validators;