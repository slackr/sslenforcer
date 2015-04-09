/**
 *    manifest permissions:
 *      http - trigger onBeforeRequest and enforce SSL
 *      https - trigger onCompleted to confirm SSL enforcement
 *      tabs - to handle per tab enforcement
 *      storage - access chrome.storage.sync/local
 *      webRequest - access to chrome.webRequest.*
 *      webRequestBlocking - control web requests before they happen
 */

/**
 * user config hard defaults
 */
var $options_defaults = AppConfig.OPTIONS_DEFAULTS;

/**
 * defaults will be loaded by get_options()
 */
var $options = {};

// http redirect loop protection
var $flood = {};

var $tab_status = {
    // tid: {enforce: [], warning: [], disabled: [], error: []}, tid2: [ .. ]
};

var $timeouts = {
    save_options: null
};

var $bg = new SknBackground();

/**
 * webRequest listeners
 */
chrome.webRequest.onBeforeRequest.addListener(
    se,
    // filters
    $bg.config.filters,
    // extraInfoSpec
    ["blocking"]
);

chrome.webRequest.onCompleted.addListener(function(data) {
        var current_state = "disabled";
        var current_weight = 0;
        var tid = data.tabId;

        $bg.log("onCompleted: " + JSON.stringify(data), 0, "debug");

        if ($options.ssle_enabled == 1
            && typeof $tab_status[tid] != 'undefined') {
            for (var state in $tab_status[tid]) {
                if (Object.keys($tab_status[tid][state]).length > 0
                    && $bg.config.states[state].weight >= current_weight) {
                    current_state = state;
                    current_weight = $bg.config.states[state].weight;
                }
            }

            if (Object.keys($tab_status[tid].enforced).length > 0
                && Object.keys($tab_status[tid].disabled).length > 0
                && Object.keys($tab_status[tid].error).length === 0) {

                current_state = "warning";
            }
        }

        set_icon(current_state, tid);
    },
    $bg.config.filters
);

chrome.webRequest.onBeforeRedirect.addListener(function(data) {
        $bg.log("onBeforeRedirect: " + JSON.stringify(data), 0, "debug");
    },
    $bg.config.filters
);

/**
 * tab event handlers
 */
chrome.tabs.onCreated.addListener(function(tab){
    $bg.log("tab " + tab.id + " was created...", 0, "tabs");
    init_tab(tab.id);
});

chrome.tabs.onRemoved.addListener(function(tid){
    $bg.log("tab " + tid + " was removed...", 0, "tabs");
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
            $bg.log("initializing extension...", 1, "install");
            save_options(); // write hard defaults
            break;
        case "update":
            var pv = details.previousVersion;

            $bg.log("initializing extension... (previous version: " + pv + ")", 1, "update");
            upgrade_ssle(pv);
            break;

    }
});

chrome.runtime.onStartup.addListener(function() {
    $bg.log("initializing extension...", 1, "startup");
    get_options(null, true);
});

chrome.runtime.onSuspend.addListener(function() {
    $bg.log("suspending extension...", 1, "suspend");
});


/**
 * messaging
 */
chrome.extension.onRequest.addListener(function(req, sender, sendResponse) {
    $bg.log("incoming message: " + JSON.stringify(req), 0, "msg");

    switch (req.type) {
        case 'gimmie_status':
            sendResponse({
                data: $tab_status[req.tid]
            });
            break;

        case 'gimmie_options':
            //this happens on enable/disable of extension, no events are fired so $options is {}
            if (Object.keys($options).length === 0) {
                $bg.log("$options is empty, attempting to retrieve from storage...", 2, "options");
                get_options(function() {
                    sendResponse({
                        options: $options
                    });
                }, false);
            } else {
                $bg.log("$options found in memory, sending response...", 1, "options");
                sendResponse({
                    options: $options
                });
            }
            break;

        case 'restore_default_options':
            $bg.storage.clear();
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
                });
            });
            break;

        case 'save_options':
            save_options(function() {
                sendResponse({
                   message: "options saved",
                   options: $options
                });
            });
            break;
        case 'import_options':
            for (var ikey in req.options) {
                $options[ikey] = req.options[ikey];
            }

            save_options(function() {
                sendResponse({
                   message: "options imported"
                });
            });
            break;

        case 'set_option':
            $options[req.key] = req.value;

            sendResponse({
               message: "option '" + req.key + " = " + (typeof(req.value) == "object" ? JSON.stringify(req.value) : req.value)  + "' set"
            });

            update_badge_text(); // for ssle_enabled option
            break;

        case 'set_rule':
            if (req.value.id === '') {
                req.value.id = $bg.uniq_id();
            } else { //cleanup existing rule before an edit
                delete_record_by_id(req.value.id);
            }

            if (req.value.old_id) {
                delete_record_by_id(req.value.old_id);
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
        $bg.log("ssle is not enabled :) :(", 0, "ssle");
        return { cancel: false };
    }

    var tid = data.tabId;
    var url = data.url;
    var type = data.type;

    var fqdn = $bg.url_parse(url, "fqdn");
    var uri = $bg.url_parse(url, "uri");
    var secure_url = "https://" + fqdn + uri;

    var enforcement = 0;

    $bg.log("get " + type + " (by tab: " + tid + ") - fqdn: " + fqdn + ", uri: " + uri, 0, "nav");

    // check if our tab has initialized properly
    if (typeof $tab_status[tid] == 'undefined') {
        init_tab(tid);
    }

    // if the tab navigates to a new main url, clear the tab status
    if (type == "main_frame" && tab_has_status(tid)) {
        $bg.log("nav to new main_frame, tab_status for tab " + tid + " reset", 0, "nav");
        uninit_tab(tid);
        init_tab(tid);
    }

    for (var pattern_ex in $options.ssle.exclude) {
        var rtest_ex = new RegExp(pattern_ex, $options.regex_flags);
        if (rtest_ex.test(fqdn + uri)) {
            push_tab_status("warning", tid, 0, {
                url: fqdn + uri,
                //pattern: pattern_ex
            });

            $bg.log("exclusion rule matched for '" + fqdn + "' (" + pattern_ex + ")", 1, "enforce");

            rtest_ex = null;
            return { cancel: false };
        }
        rtest_ex = null;
    }
    for (var pattern_en in $options.ssle.enforce) {
        var rtest_en = new RegExp(pattern_en, $options.regex_flags);
        if (rtest_en.test(fqdn + uri)) {
            push_tab_status("enforced", tid, 1, {
                url: fqdn + uri,
                //pattern: pattern_en
            });

            $bg.log("rule matched for '" + fqdn + "' (" + pattern_en + "), rewriting request to: " + secure_url, 1, "enforce");

            rtest_en = null;
            return ($bg.is_https(url) ? { cancel: false } : flood_check(fqdn + uri, secure_url, tid));
        }
        rtest_en = null;
    }

    if ($bg.is_https(url)) {
        if ($options.verbose_tab) {
            push_tab_status("enforced", tid, 0, {
                url: fqdn + uri
            });
        }

        $bg.log("url '" + fqdn + uri + "' is already https, ignoring", 0, "enforce");
        return { cancel: false };
    }

    // no rules matched, url is not https
    push_tab_status("disabled", tid, 0, {
        url: fqdn + uri,
    });

    $bg.log("no rules matched for url: " + fqdn + "/" + uri, 1, "enforce");
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
    if (typeof $flood[url] == 'undefined') {
        $bg.log("url not tracked, initializing: " + url, 0, "flood");

        $flood[url] = { hits: 1 };
        setTimeout(function() {
            if (typeof $flood[url] != 'undefined') {
                $bg.log("tracking expired for: " + url, 0, "flood");

                delete $flood[url];
            }
        }, $options.flood.ms);

    } else if ($flood[url].hits > $options.flood.hits) {
        push_tab_status("error", tid, 0, {
            url: url,
        });

        $bg.log("url is flooding, will not enforce SSL (" + $flood[url].hits + " hits in " + $options.flood.ms + "ms): " + url, 1, "flood");
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
    if (tid == -1) {
        $bg.log("tab status tracking for tabid: -1 skipped", 0, "tabs");
        return;
    }

    if (typeof $tab_status[tid][state][reason] == 'undefined') {
        $tab_status[tid][state][reason] = [];
    }

    if (tab_reason_url_count(tid, state, reason) > $options.max_tab_status) {
        $bg.log("tab status count exceeded " + $options.max_tab_status + " for '" + tid + "', ssle will cease reporting on new urls but will continue to enforce", 1, "ssle");
    } else {
        $tab_status[tid][state][reason].push(data);
        $bg.log("pushed status to tab "+ tid +"("+state+"): "+ JSON.stringify(data), 0, "tabs");
    }
}

function tab_reason_url_count(tid, state, reason) {
    return Object.keys($tab_status[tid][state][reason]).length;
}

/**
 * check if a tab has at least one status populated
 */
function tab_has_status(tid) {
    if (typeof $tab_status[tid] != 'undefined') {
        for (var state in $bg.config.states) {
            if (Object.keys($tab_status[tid][state]).length > 0) {
                return true;
            }
        }
    }
    return false;
}

function uninit_tab(tid) {
    delete $tab_status[tid];
    update_badge_text();

    $bg.log("tab_status for "+ tid +" uninitialized", 0, "tabs");
}

function init_tab(tid) {
    // initialize tab_status
    $tab_status[tid] = {};

    for (var state in $bg.config.states) {
        $tab_status[tid][state] = {};
    }

    update_badge_text();
    set_icon("disabled", tid);

    $bg.log("tab_status for "+ tid +" initialized", 0, "tabs");
}

/**
 * options handlers
 */
function get_options(callback, convert_legacy) {
    if (Object.keys($options).length === 0) {
        /**
         * clone object, doesn't support object values.. (regex)
         */
        $bg.log("no options in memory, using defaults", 1, "storage");
        $options = JSON.parse(JSON.stringify($options_defaults));
    }

    $bg.storage.get("options", function(items) {
        if (typeof chrome.runtime.lastError != 'undefined') {
            $bg.log("error on storage.get: " + JSON.stringify(chrome.runtime.lastError), 1, "storage");
        }

        if (typeof items.options == 'undefined') {
            $bg.log("no options in storage, using defaults", 1, "storage");
            $options = JSON.parse(JSON.stringify($options_defaults));
        } else {
            if (convert_legacy) {
                $bg.log('performing legacy ruleset conversion', 1, 'ruleset');
                items.options.ssle = convert_legacy_ruleset(items.options.ssle);
            }

            for (var o in items.options) {
                $options[o] = items.options[o];
            }
            update_badge_text();

            $bg.log("options retrieved from storage (" + AppConfig.STORAGE_TYPE + ")", 1, "storage");
        }

        if (typeof callback == 'function') {
            callback(items);
        }
    });
}

function save_options(callback) {
    if (Object.keys($options).length === 0) {
        /**
         * clone object, doesn't support object values.. (regex)
         */
        $bg.log("no options in memory, using defaults", 1, "storage");
        $options = JSON.parse(JSON.stringify($options_defaults));
    }

    clearTimeout($timeouts.save_options);
    $timeouts.save_options = setTimeout(function() {
        $bg.storage.set({options: $options}, function() {
            $bg.log("options saved to storage (" + AppConfig.STORAGE_TYPE + ")", 1, "storage");

            if (typeof callback == 'function'){
                callback();
            }
        });
    }, $bg.config.save_options_delay);
    $bg.log("options save action delayed by " + $bg.config.save_options_delay + "ms to avoid flooding storage", 1, "debug");
}

// expects the $options.ssle object
function convert_legacy_ruleset(ruleset) {
    for (var type in ruleset) {
        for (var rule in ruleset[type]) {
            if (rule.substr(0,6) == "^.*\\.") { // fix conversion issue from 1.0.2
                var rule_fix = "^[a-z0-9\\-\\.]*" + rule.substr(5);
                ruleset[type][rule_fix] = { id: ruleset[type][rule].id };
                delete ruleset[type][rule];
                $bg.log("rule fix '" + rule + "' -> '" + rule_fix + "' = '" + JSON.stringify(ruleset[type][rule_fix]) + "'",  0, "legacy");
            }
            if (typeof ruleset[type][rule].subdomains != 'undefined') {
                var regex_rule = $bg.escape_regex(rule);

                regex_rule = ((ruleset[type][rule].subdomains == 1) ? "^[a-z0-9\\-\\.]*" : "^") + regex_rule;
                regex_rule = regex_rule + ((ruleset[type][rule].uri !== '') ? $bg.escape_regex(ruleset[type][rule].uri) + "$" : "/.*$");

                ruleset[type][regex_rule] = { id: ruleset[type][rule].id };
                delete ruleset[type][rule];

                $bg.log("converted legacy rule '" + rule + "' -> '" + regex_rule + "' = '" + JSON.stringify(ruleset[type][regex_rule]) + "'", 1, "legacy");
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

function set_icon(icon, tid) {
    if (tid != -1) {
        chrome.browserAction.setIcon({
            path: $bg.config.icons[icon],
            tabId: tid
        });

        $bg.log("icon set to '" + icon + "' on tab: " + tid, 0, 'icon');
    } else {
        $bg.log("icon not set for tab: " + tid, 0, 'icon');
    }

}

function update_badge_text() {
    chrome.browserAction.setBadgeText({
        "text" : ($options.ssle_enabled ? "" : "x")
    });
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

function upgrade_ssle(previous_version) {
    $bg.log('upgrading ssle from ' + previous_version + '...', 1, 'upgrade');

    var convert_legacy_ruleset = false;

    if (version_compare('1.0.2', previous_version) >= 0) {
        convert_legacy_ruleset = true;
    }

    get_options(function() {
        if ($options.log_level < 0) {
            $options.log_level = 0;
            $bg.log('fixed log_level value (< 0)', 1, 'upgrade');
        }
    }, convert_legacy_ruleset);
}
