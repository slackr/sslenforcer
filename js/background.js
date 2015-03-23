/**
 *    manifest permissions:
 *      http - trigger onBeforeRequest and enforce SSL
 *      https - trigger onCompleted to confirm SSL enforcement
 *      tabs - to handle per tab enforcement
 *      storage - access chrome.storage.sync/local
 *      webRequest - access to chrome.webRequest.*
 *      webRequestBlocking - control web requests before they happen
 */
const STORAGE_TYPE = 'sync'; // 'sync' or 'local'
var $storage = (STORAGE_TYPE == 'sync' ? chrome.storage.sync : chrome.storage.local);

/**
 * user config hard defaults
 */
var $options_defaults = {
    ssle_enabled: 1,
    log_level: 2,
    verbose_tab: 0,
    regex_flags: "ig",
    flood: {
        hits: 3,
        ms: 2000,
    },
    max_tab_status: 100,

    ssle : {
        enforce: {
            '^[a-z0-9\\-\\.]*google\\.(ca|com)/.*$': { id: "iafcc8854" },
            '^[a-z0-9\\-\\.]*wikipedia\\.org/.*$': { id: "ia74d8e02" },
            '^[a-z0-9\\-\\.]*chrome\\.com/.*$': { id: "ie7b9ad91" },
            '^[a-z0-9\\-\\.]*linkedin\\.com/.*$': { id: "i5c9f10bf" },
            '^[a-z0-9\\-\\.]*facebook\\.com/.*$': { id: "iee48a9a4" },
            '^[a-z0-9\\-\\.]*twitter\\.com/.*$': { id: "i1a845a6a" },
            '^[a-z0-9\\-\\.]*fbcdn\\.net/.*$': { id: "ib4575dbb" },
            '^[a-z0-9\\-\\.]*imgur\\.com/.*$': { id: "ib4575dbb" },
            '^webcache\\.googleusercontent\\.com/.*$': { id: "ib2890983" },
            '^[a-z0-9\\-\\.]*reddit\\.com/.*$': { id: "i2ebf94ef" },
            '^[a-z0-9\\-\\.]*instagram\\.com/.*$': { id: "ifa079487" },
            '^[a-z0-9\\-\\.]*yahoo\\.(ca|com)/.*$': { id: "ib4d10a60" },
            '^[a-z0-9\\-\\.]*echoes\\.im/.*$': { id: "ie6fffe6c" },
        },
        exclude: {
            // /blank.html causes issues with http://www.google.ca/imgres urls
            // URL floods out and tries to load https iframe, Chrome blocks it
            '^www\\.google\\.(ca|com)/blank.html$': { id: "i0ad1fd08" }, // to fix images.google.com ssl enforcement
        },
    },
};

/**
 * clone object, doesn't support object values.. (regex)
 */
var $options = JSON.parse(JSON.stringify($options_defaults));

/**
 * engine config
 */
var $config = {
    max_import_filesize: 5242880, //5mb
    save_options_delay: 3000,
    allowed_regex_flags: {
        "i" : "Case-Insensitive",
        "g" : "Global Search"
    },
    filters: {
        urls: ["http://*/*", "https://*/*"],
        types: [
            "main_frame",
            "sub_frame",
            "script",
            "object",
            "xmlhttprequest",
            "stylesheet",
            "image",
            "other",
        ]
    },
    icons: { // icons borrowed from http://dakirby309.deviantart.com/gallery/#/d4n4w3q with promise of safe return
        enforced: "img/enforced.png",
        disabled: "img/disabled.png",
        warning: "img/warning.png",
        error: "img/error.png",
    },
    states: {
        enforced: { weight: 0 },
        disabled: { weight: 10 },
        warning: { weight: 20 },
        error: { weight: 30 },
    },
    state_reason: {
        "-2": "Not enforced due to flooding",
        "-1": "Enforcement explicitly disabled",
        "0": "No rules matched",
        "1": "Rule matched for enforcement",
        "2": "URL was accessed via HTTPS",
    },
}

// http redirect loop protection
var $flood = {};

var $tab_status = {
    // tid: {enforce: [], warning: [], disabled: [], error: []}, tid2: [ .. ]
};

var $timeouts = {
    save_options: null
}

/**
 * webRequest listeners
 */
chrome.webRequest.onBeforeRequest.addListener(
    se,
    // filters
    $config.filters,
    // extraInfoSpec
    ["blocking"]
);

chrome.webRequest.onCompleted.addListener(function(data) {
        var current_state = "disabled";
        var current_weight = 0;
        var tid = data.tabId;

        log("onCompleted: " + JSON.stringify(data), -2, "debug");

        if ($options.ssle_enabled == 1
            && $tab_status[tid] != undefined) {
            for (var state in $tab_status[tid]) {
                if (Object.keys($tab_status[tid][state]).length > 0
                    && $config.states[state].weight >= current_weight) {
                    current_state = state;
                    current_weight = $config.states[state].weight;
                }
            }

            if (Object.keys($tab_status[tid].enforced).length > 0
                && Object.keys($tab_status[tid].disabled).length > 0
                && Object.keys($tab_status[tid].error).length == 0) {

                current_state = "warning";
            }
        }

        set_icon(current_state, tid);
    },
    $config.filters
);

chrome.webRequest.onBeforeRedirect.addListener(function(data) {
        log("onBeforeRedirect: " + JSON.stringify(data), -2, "debug");
    },
    $config.filters
);

/**
 * tab event handlers
 */
chrome.tabs.onCreated.addListener(function(tab){
    log("tab " + tab.id + " was created...", -1, "tabs");
    init_tab(tab.id);
});

chrome.tabs.onRemoved.addListener(function(tid){
    log("tab " + tid + " was removed...", -1, "tabs");
    uninit_tab(tid);
});

/**
 * runtime handlers
 *
 * @req chrome 23+
 */
chrome.runtime.onInstalled.addListener(function(details) {
    switch (details.reason) {
        case "install":
            log("initializing extension...", $options_defaults.log_level, "install"); // use $options_defaults.log_level as level to make sure log is shown
            save_options(); // write hard defaults
            break;
        case "update":
            var pv = details.previousVersion;

            log("initializing extension... (previous version: " + pv + ")", $options_defaults.log_level, "update");
            get_options(null, (version_compare('1.0.2', pv) >= 0 ? true : false));
            break;

    }
});

chrome.runtime.onStartup.addListener(function() {
    log("initializing extension...", 0, "startup");
    get_options(null, true);
});


/**
 * messaging
 */
chrome.extension.onRequest.addListener(function(req, sender, sendResponse) {
    log("incoming message: " + JSON.stringify(req), -2, "msg");

    switch (req.type) {
        case 'gimmie_status':
            sendResponse({
                data: $tab_status[req.tid]
            });
            break;

        case 'gimmie_options':
            sendResponse({
                data: $options
            });
            break;

        case 'gimmie_config':
            sendResponse({
                data: $config
            });
            break;

        case 'gimmie_config_and_options':
            sendResponse({
                config: $config,
                options: $options
            });
            break;

        case 'restore_default_options':
            $storage.clear();
            get_options();
            sendResponse({
               message: "storage was cleared and default options were restored"
            });
            break;

        case 'sync_with_default_ruleset':
            sync_with_default_ruleset();
            save_options(function() {
                sendResponse({
                   message: "synced with default ruleset",
                   options: $options
                })
            });
            break;


        case 'save_options':
            save_options(function() {
                sendResponse({
                   message: "options saved",
                   options: $options
                })
            });
            break;
        case 'import_options':
            $options = req.options;

            save_options(function() {
                sendResponse({
                   message: "options imported"
                })
            });
            break;

        case 'set_option':
            $options[req.key] = req.value;

            sendResponse({
               message: "option '" + req.key + " = " + (typeof(req.value) == "object" ? JSON.stringify(req.value) : req.value)  + "' set"
            });
            break;

        case 'set_rule':
            if (req.value.id == "") {
                req.value.id = uniq_id();
            } else { //cleanup existing rule before an edit
                delete_record_by_id(req.value.id);
            }

            $options.ssle[req.rule_type][req.rule_pattern] = req.value;

            sendResponse({
                message: "rule '" + req.rule_pattern + " = " + JSON.stringify(req.value) + "' set in '" + req.rule_type + "' ruleset"
            });
            break;

        case 'delete_rule':
            delete_record_by_id(req.id);

            sendResponse({
                message: "ssle record '" + req.rule_entry + " (" + req.rule_type + ":" + req.id + ")' was removed"
            });
            break;

        default:
            sendResponse({}); // snub them.
            break;
    }
});

/**
 * ssle engine
 */
function se(data) {
    update_badge_text();

    if ($options.ssle_enabled != 1) {
        log("ssle is not enabled :) :(", -1, "ssle");
        return { cancel: false };
    }

    var tid = data.tabId;
    var url = data.url;
    var type = data.type;

    var fqdn = url.url_parse("fqdn");
    var uri = url.url_parse("uri");
    var secure_url = "https://" + fqdn + uri

    var enforcement = 0;
    var status_msg = "";

    log("get " + type + " (by tab: " + tid + ") - fqdn: " + fqdn + ", uri: " + uri, -2, "nav");

    // check if our tab has initialized properly
    if ($tab_status[tid] == undefined) {
        init_tab(tid);
    }

    // if the tab navigates to a new main url, clear the tab status
    if (type == "main_frame" && tab_has_status(tid)) {
        log("nav to new main_frame, tab_status for tab " + tid + " reset", -2, "nav");
        uninit_tab(tid);
        init_tab(tid);
    }

    for (var pattern in $options.ssle.exclude) {
        var rtest = new RegExp(pattern, $options.regex_flags);
        if (rtest.test(fqdn + uri)) {
            status_msg = "exclusion rule matched for '" + fqdn + "' (" + pattern + ")";
            push_tab_status("warning", tid, -1, {
                url: fqdn + uri,
                pattern: pattern
            });

            log(status_msg, 1, "enforce");
            return { cancel: false };
        }
    }
    for (var pattern in $options.ssle.enforce) {
        var rtest = new RegExp(pattern, $options.regex_flags);
        if (rtest.test(fqdn + uri)) {
            status_msg = "rule matched for '" + fqdn + "' (" + pattern + "), rewriting request to: " + secure_url;
            push_tab_status("enforced", tid, 1, {
                url: fqdn + uri,
                pattern: pattern
            });

            log(status_msg, 1, "enforce");
            return (url.is_https() ? { cancel: false } : flood_check(fqdn + uri, secure_url, tid));
        }
    }

    if (url.is_https()) {
        status_msg = "url '" + fqdn + uri + "' is already https, ignoring";

        if ($options.verbose_tab) {
            push_tab_status("enforced", tid, 2, {
                url: fqdn + uri
            });
        }

        log(status_msg, 1, "enforce");
        return { cancel: false };
    }

    // no rules matched, url is not https
    status_msg = "no rules matched for url: " + fqdn + "/" + uri;
    push_tab_status("disabled", tid, 0, {
        url: fqdn + uri,
        //msg: status_msg
    });
    log(status_msg, 1, "enforce");
    return { cancel: false };
}

/**
 * @param1 url - use full url since some domains will force HTTP based on URI
 * @param2 secure_url - url to redirect to if not flooding
 *
 * @return { redirectUrl: @param2 } if within $options.flood.reqs / $options.flood.secs
 * @return { cancel: false }
 */
function flood_check(url, secure_url, tid) {
    var status_msg = "";

    if (typeof $flood[url] == 'undefined') {
        log("url not tracked, initializing: " + url, -1, "flood");
        $flood[url] = { hits: 1 };
        setTimeout(function() {
            if (typeof $flood[url] != 'undefined') {
                log("tracking expired for: " + url, -1, "flood");
                delete $flood[url];
            }
        }, $options.flood.ms);

    } else if ($flood[url].hits > $options.flood.hits) {
        status_msg = "url is flooding, will not enforce SSL (" + $flood[url].hits + " hits in " + $options.flood.ms + "ms): " + url;

        push_tab_status("error", tid, -2, {
            url: url,
            //msg: status_msg
        });

        log(status_msg, 1, "flood");
        return { cancel: false };
    } else {
        $flood[url].hits++;
    }

    return { redirectUrl: secure_url };
}

/**
 * write url enforcement information to tab_status
 */
function push_tab_status(state, tid, reason, data) {
    if (typeof $tab_status[tid][state][reason] == 'undefined') {
        $tab_status[tid][state][reason] = [];
    }

    if (tab_reason_url_count(tid, state, reason) > $options.max_tab_status) {
        log("tab status count exceeded " + $options.max_tab_status + " for '" + tid + "', ssle will cease reporting on new urls but will continue to enforce", 1, "ssle");
    } else {
        $tab_status[tid][state][reason].push(data);
        log("pushed status to tab "+ tid +"("+state+"): "+ JSON.stringify(data), -1, "tabs");
    }
}

function tab_reason_url_count(tid, state, reason) {
    return Object.keys($tab_status[tid][state][reason]).length;
}

/**
 * check if a tab has at least one status populated
 */
function tab_has_status(tid) {
    var has_status = false;
    if (typeof $tab_status[tid] != 'undefined') {
        for (var state in $config.states) {
            if (Object.keys($tab_status[tid][state]).length > 0) {
                has_status = true;
                break;
            }
        }
    }
    return has_status;
}

/**
 * check if url is a supported request type
 *
 * tab_status is only populated when onBeforeRequest triggers
 * which is filtered by $config.filters
 */
function url_isin_types(url) {
    if (typeof $tab_status[tid] != 'undefined') {
        for (var state in $config.states) {
            if ($tab_status[tid][state].contains(u)) {
                return true;
            }
        }
    }
    return false;
}

function uninit_tab(tid) {
    delete $tab_status[tid];
    update_badge_text();

    log("tab_status for "+ tid +" uninitialized", -1, "tabs");
}

function init_tab(tid) {
    // initialize tab_status
    $tab_status[tid] = {};

    for (var state in $config.states) {
        $tab_status[tid][state] = {};
    }

    update_badge_text();
    set_icon("disabled", tid);

    log("tab_status for "+ tid +" initialized", -1, "tabs");
}

/**
 * options handlers
 */
function get_options(callback, convert_legacy) {
    $storage.get("options", function(items) {
        if (typeof chrome.runtime.lastError != 'undefined') {
            log("error on storage.get: " + JSON.stringify(chrome.runtime.lastError), $options_defaults.log_level, "storage");
        }

        if (typeof items.options == 'undefined') {
            log("no options in storage, using hard defaults", $options_defaults.log_level, "storage");
            $options = JSON.parse(JSON.stringify($options_defaults));
        } else {
            if (convert_legacy) {
                log('performing legacy ruleset conversion', $options_defaults.log_level, 'ruleset');
                items.options.ssle = convert_legacy_ruleset(items.options.ssle);
            }

            for (var o in items.options) {
                $options[o] = items.options[o];
            }
            update_badge_text();

            log("options retrieved from storage (" + STORAGE_TYPE + ")", 0, "storage");
        }

        if (callback != undefined)
            callback(items);
    });
}

function save_options(callback) {
    clearTimeout($timeouts.save_options);
    $timeouts.save_options = setTimeout(function() {
        $storage.set({options: $options}, function() {
            log("options saved to storage (" + STORAGE_TYPE + ")", 0, "storage");

            if (callback != undefined)
                callback();
        });
    }, $config.save_options_delay);
    log("options save action delayed by " + $config.save_options_delay + "ms to avoid flooding storage", -2, "debug");
}

// expects the $options.ssle object
function convert_legacy_ruleset(ruleset) {
    for (var type in ruleset) {
        for (var rule in ruleset[type]) {
            if (rule.substr(0,6) == "^.*\\.") { // fix conversion issue from 1.0.2
                var rule_fix = "^[a-z0-9\\-\\.]*" + rule.substr(5);
                ruleset[type][rule_fix] = { id: ruleset[type][rule].id };
                delete ruleset[type][rule];
                log("rule fix '" + rule + "' -> '" + rule_fix + "' = '" + JSON.stringify(ruleset[type][rule_fix]) + "'",  $options_defaults.log_level, "legacy")
            }
            if (typeof ruleset[type][rule].subdomains != 'undefined') {
                var regex_rule = rule.escape_regex();

                regex_rule = ((ruleset[type][rule].subdomains == 1) ? "^[a-z0-9\\-\\.]*" : "^") + regex_rule;
                regex_rule = regex_rule + ((ruleset[type][rule].uri != "") ? ruleset[type][rule].uri.escape_regex() + "$" : "/.*$");

                ruleset[type][regex_rule] = { id: ruleset[type][rule].id };
                delete ruleset[type][rule];

                log("converted legacy rule '" + rule + "' -> '" + regex_rule + "' = '" + JSON.stringify(ruleset[type][regex_rule]) + "'",  $options_defaults.log_level, "legacy")
            }
        }
    }
    return ruleset;
}

/**
 * Compare two version strings, must be single digits:
 *
 * 1.2.3 cmp 1.2.5
 *
 * not 1.2.45 cmp 1.2.5
 *
 * Returns 0 if equal, 1 if v1 is greater, -1 if v2 is greater
 *
 * @param   {string} v1 Version one to compare
 * @param   {string} v2 Version two to compare
 *
 * @returns {int} Returns 0 if equal, 1 if v1 is greater, -1 if v2 is greater
 */
function version_compare(v1, v2) {
    v1 = parseInt(v1.replace(/[^0-9]+/gi,''));
    v2 = parseInt(v2.replace(/[^0-9]+/gi,''));

    if (v1 == v2) {
        return 0;
    } else if (v1 > v2) {
        return 1;
    } else {
        return -1;
    }
}

/**
 * Syncs current ruleset with default ruleset
 *
 * @returns {null}
 */
function sync_with_default_ruleset() {
    for (var ruleset_type in $options_defaults.ssle) {
        for (var rule in $options_defaults.ssle[ruleset_type]) {
            $options.ssle[ruleset_type][rule] = $options_defaults.ssle[ruleset_type][rule];
        }
    }
}
