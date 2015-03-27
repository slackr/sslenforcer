/**
 * SKN SSLE
 *
 * @author  Adrian@Slacknet
 * @license http://www.gnu.org/licenses/gpl-3.0.txt GPLv3
 */

/**
 * Background.js controller
 *
 * @class
 * @extends SknObject
 */
function SknBackground() {
    SknObject.call(this, 'bg');


    /**
     * Which storage object to bind to
     *
     * @see AppConfig#STORAGE_TYPE
     */
    this.storage = (AppConfig.STORAGE_TYPE == 'sync' ? chrome.storage.sync : chrome.storage.local);

    this.config = AppConfig.CONFIG;
    this.options_defaults = AppConfig.OPTIONS_DEFAULTS;
}
SknBackground.prototype = Object.create(SknObject.prototype);
SknBackground.prototype.constructor = SknBackground;
