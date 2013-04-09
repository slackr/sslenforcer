/**
 * this .js requires $config and $options from background.js
 *
 * use messages 'gimmie_options' and 'gimmie_config' to retrieve values
 */ 

/**
 * utils
 */
function log(msg, level, zone) {
    level = (level != null ? level : 0);
    zone = (zone != null ? zone : "info");

    if (level >= $options.log_level) {
        chrome.runtime.getBackgroundPage(function(bg) {
            bg.console.log("[ssle(" + zone + ":" + level + ")] " + msg);
        });
    }
}

function set_icon(icon, tid) {
    chrome.browserAction.setIcon({
        path: $config.icons[icon],
        tabId: tid
    });
    log("icon set to '" + icon + "' on tab: " + tid);
}

function update_badge_text() {
    chrome.browserAction.setBadgeText({
        "text" : ($options.ssle_enabled ? "" : "x")
    });
}

/**
 * return reverse sorted array of states based on $config.states[...].weight
 *
 * sorry, I can't think of a better way to do this right now..
 */
function prioritize_states() {
    var priority = [], weights = [];

    for (var state in $config.states) {
        weights.push($config.states[state].weight);
    }
    weights = weights.reverse();

    for (var i = 0; i < weights.length; i++) {
        for (var state in $config.states)
            if ($config.states[state].weight == weights[i])
                priority.push(state);
    }
    return priority;
}



function toggle_ssle() {
    $options.ssle_enabled = ($options.ssle_enabled ? 0 : 1);
    $('#ext_state')
        .addClass($options.ssle_enabled ? "button_on" : "button_off")
        .removeClass(!$options.ssle_enabled ? "button_on" : "button_off")
        .text($options.ssle_enabled ? "Enabled" : "Disabled");
    
    chrome.extension.sendRequest({type: 'set_option', key: 'ssle_enabled', value: $options.ssle_enabled}, message_received);
    chrome.extension.sendRequest({type: 'save_options'}, message_received);
    
    update_badge_text();
}

function message_received(ret) {
    log("received response from background.js: '" + ret.message + "'", 0, "msg");
}

function uniq_id() {
    var S4 = function() {
        return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };

    return (S4() + "-" + S4());
}

/**
 * prototypes
 */

/**
 * returns true if array contains a value
 */
Array.prototype.contains = function(what) {
    var i, v;
    for (i = 0; i < this.length; i++){
        if (this[i] == what) {
            return true;
        }
    }
    return false;
}

/**
 * returns 'what' part of the url
 */
String.prototype.url_parse = function(what) {
    switch (what) {
        case "uri":
            return this.match(/^(http[s]?:\/\/)?[\w\.\-]+(\/.*)$/im)[2] || "";
            break;

        case "fqdn":
            return this.match(/^(http[s]?:\/\/)?([\w\.\-]+)\/.*$/im)[2] || "";
            break;

        case "protocol":
            return this.match(/^([\w]+):\/\//im)[1] || "";
            break;

        case "domain":
            return this.split(".").slice(-2).join(".") || "";
            break;

        case "subdomains":
            var subs = this.split(".");
            subs.pop(); subs.pop();
            return subs || [];

        default:
            break;
    }
    return null;
}

/**
 * shorten a string and append ... to the end
 * no dots are added if second param is true
 */
String.prototype.limit = function(limit, no_dots) {
    return this.substr(0,limit) + (no_dots || this.length <= limit ? "" : "...");
}

/**
 * returns true if string starts with https://
 */
String.prototype.is_https = function() {
    return (this.match(/^https:\/\/.+$/im) != null ? true : false);
}
