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
