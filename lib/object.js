/**
 * SKN SSLE
 *
 * @author  Adrian@Slacknet
 * @license http://www.gnu.org/licenses/gpl-3.0.txt GPLv3
 */

/**
 * Parent class that handles logging and whatnot
 *
 * @class
 */

/**
 * Constructor initializes logging capabilities
 *
 * Child objects can call this constructor with a component name
 * This name will be added to log entries
 *
 * @param   {string} component The component name chosen by client
 *
 * @returns {null}
 */
function SknObject(component) {
    this.log_levels = {
        0: 'debug',
        1: 'info',
        2: 'warn',
        3: 'error',
    }
    this.component = component + '';
}

/**
 * Add log entry to either console or log_entries array
 * Default level = '1'
 *
 * @param   {string} msg    Message to add to log
 * @param   {integer} level (default='1') Message criticality
 *
 * @returns {null}
 */
SknObject.prototype.log = function(msg, level, subtype) {
    level = (typeof level == 'number' ? level : 1);
    subtype = subtype || '';

    if (level >= AppConfig.LOG_LEVEL) {
        var timestamp = new Date().toLocaleString();
        var entry = timestamp + ' - ' + (this.component ? this.component.toLowerCase() + ' - ' : '') + (subtype ? subtype.toLowerCase() + ' - ' : '') + this.log_levels[level] + ': ' + msg;

        if (level >= 3) {
            console.error(entry);
        } else if (level == 2) {
            console.warn(entry);
        } else {
            console.log(entry);
        }

        //chrome.runtime.getBackgroundPage(function(bg) {
        //    if (level >= 3) {
        //        bg.console.error(entry);
        //    } else {
        //        bg.console.log(entry);
        //    }
        //});
    }
};

/**
 * Used by pages as callback for when a message
 * is received from background.js
 *
 * @param   {object} msg    Object containing among other things the message property
 *
 * @returns {null}
 */
SknObject.prototype.message_received = function(msg) {
    this.log("message received: '" + msg.message + "'", 1, "msg");
};

/**
 * Returns true if string starts with https://
 *
 * @param {string}  str String to check
 *
 * @returns {bool}
 */
SknObject.prototype.is_https = function(str) {
    return (str.substr(0,8) == "https://" ? true : false);
};

/**
 * Escape regex special chars, stolen from MDN
 *
 * @param {string}  str String to escape
 *
 * @returns {string} Sanitized string
 */
SknObject.prototype.escape_regex = function(str) {
    return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
};

/**
 * Shorten a string and append ... to the end
 *
 * no dots are added if third param is true
 *
 * @param   {str}   str String to limit
 * @param   {int}   limit   Maximum characters
 * @param   {bool}  no_dots Do not add '...' for limited string
 *
 * @returns {string}    The limited string
 */
SknObject.prototype.limit = function(str, limit, no_dots) {
    no_dots = no_dots || false;

    return str.substr(0, limit) + (!no_dots && str.length > limit ? '...' : '');
};


/**
 * Returns the specified chunk of a url string
 *
 * uri, fqdn, protocol, domain, subdomains
 *
 * 'subdomains' returns an array of subdomains
 * all others return a string
 *
 * @param   {string}   url String to parse
 * @param   {string}   what   Which part of the url to return
 *
 * @returns {string|Array}    The parsed result
 */
SknObject.prototype.url_parse = function(url, what) {
    switch (what) {
        case "uri":
            return url.match(/^(http[s]?:\/\/)?[\w\.\-]+(\/.*)$/im)[2] || '';

        case "fqdn":
            return url.match(/^(http[s]?:\/\/)?([\w\.\-]+)\/.*$/im)[2] || '';

        case "protocol":
            return url.match(/^([\w]+):\/\//im)[1] || '';

        case "domain":
            return url.split(".").slice(-2).join(".") || '';

        case "subdomains":
            var subs = url.split(".");
            subs.pop();
            subs.pop();
            return subs || [];

        default:
        break;
    }
    return '';
};


/**
 * Returns a unique string of characters prepended with 'i'
 *
 * @returns {string}    Unique string: 'iabc1234'
 */
SknObject.prototype.uniq_id = function() {
    var S4 = function() {
        return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };

    return "i" + (S4() + S4());
}
