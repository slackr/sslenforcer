/**
 * rule db
 */
function select_record_by_id(id) {
    for (var type in $options.ssle) {
        for (var entry in $options.ssle[type]) {
            if ($options.ssle[type][entry].id == id) {
                return { type: type, entry: entry };
            }
        }
    }
    return undefined;
}
function delete_record_by_id(id) {
    for (var type in $options.ssle) {
        for (var entry in $options.ssle[type]) {
            if ($options.ssle[type][entry].id == id) {
                delete $options.ssle[type][entry];
            }
        }
    }
}

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
    if (tid != -1) {
        chrome.browserAction.setIcon({
            path: $config.icons[icon],
            tabId: tid
        });
        
        log("icon set to '" + icon + "' on tab: " + tid, -2, "debug");
    } else {
        log("icon not set for tab: " + tid, -2, "debug");
    }
    
}

function update_badge_text() {
    chrome.browserAction.setBadgeText({
        "text" : ($options.ssle_enabled ? "" : "x")
    });
}

/**
 * return array of states sorted by descending weight
 */
function prioritize_states() {
    var stateSortArr = [];
    for (stateName in $config.states) {
        stateSortArr.push({ name: stateName, weight: $config.states[stateName].weight });
    }

    stateSortArr.sort(function(a, b) { return b.weight - a.weight }); //b - a for descending sort
    return stateSortArr.map(function(state) { return state.name });
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
    var id = "i" + (S4() + S4());
    
    if (typeof select_record_by_id(id) != "undefined") {
        id = uniq_id();
    }
    return id;
}

function show_popup() {
    $('#popup').fadeIn('fast');
}
function hide_popup() {
    $('#popup').fadeOut('fast');
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
