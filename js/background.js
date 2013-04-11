const STORAGE_TYPE = 'sync'; // 'sync' or 'local'
var $storage = (STORAGE_TYPE == 'sync' ? chrome.storage.sync : chrome.storage.local);

/**
 * user config hard defaults
 */
var $options = {
    ssle_enabled: 1,
    log_level: -2,
    flood: {
        hits: 3,
        ms: 2000,
    },
    max_tab_status: 500,
}

/**
 * engine config
 */
var $config = {
    filters: {
        urls: ["http://*/*", "https://*/*"],
        types: [
            "main_frame",
            "sub_frame",
            "script",
            "object",
            "xmlhttprequest",
            "stylesheet",
            "image", // may break certain sites: images.google.com or facebook
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
        "-4": "Enforcement explicitly disabled",
        "-3": "Full URL did not match enforcement",
        "-2": "Not enforced due to flooding",
        "-1": "Domain matched but subdomains not enforced",
        "0": "Not enforcing for URL",
        "1": "Domain matched for enforcement",
        "2": "FQDN matched for enforcement",
        "3": "Full URL matched for enforcement",
        "4": "URL is already HTTPS",
    },
}

// http redirect loop protection
var $flood = {};

var $ssle = {
    enforcement: {
        "google.ca": { subdomains: 1, uri: "", id: "1" },
        "google.com": { subdomains: 1, uri: "", id: "2" },
        "wikipedia.org": { subdomains: 1, uri: "", id: "3" },
        "chrome.com": { subdomains: 1, uri: "", id: "4" },
        "www.rogers.com": { subdomains: 0, uri: "/web/Rogers.portal", id: "5" },
        "linkedin.com": { subdomains: 1, uri: "", id: "6" },
        "facebook.com": { subdomains: 1, uri: "", id: "7" },
        "twitter.com": { subdomains: 1, uri: "", id: "8" },
        "youtube.com": { subdomains: 1, uri: "", id: "9" },
        "ytimg.com": { subdomains: 1, uri: "", id: "10" },
        "fbcdn.net": { subdomains: 1, uri: "", id: "11" },
        "webcache.googleusercontent.com": { subdomains: 0, uri: "", id: "12" },
    },
    dont_enforce: {
        "youtube.com": { subdomains: 1, uri: "", id: "1" },
        "ytimg.com": { subdomains: 1, uri: "", id: "2" },
        
        // /blank.html causes issues with http://www.google.ca/imgres urls
        // URL floods out and tries to load https iframe, Chrome blocks it
        "www.google.ca": { subdomains: 0, uri: /^\/blank.html$/i, id: "3" }, // to fix images.google.com ssl enforcement
        "www.google.com": { subdomains: 0, uri: /^\/blank.html$/i, id: "4" }, // to fix images.google.com ssl enforcement
    },
};

var $tab_status = {
    // tid: {enforce: [], warning: [], disabled: [], error: []}, tid2: [ .. ]
};

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

chrome.webRequest.onCompleted.addListener(
    function(data) {
        var current_state = "disabled";
        var current_weight = 0;
        var tid = data.tabId;

        log("onCompleted: " + JSON.stringify(data), -2, "debug");

        if ($tab_status[tid] != undefined) {
            for (var state in $tab_status[tid]) {
                if (Object.keys($tab_status[tid][state]).length > 0
                    && $config.states[state].weight >= current_weight) {
                    current_state = state;
                    current_weight = $config.states[state].weight;
                }
            }

            if (Object.keys($tab_status[tid].enforced).length > 0
                && Object.keys($tab_status[tid].disabled).length > 0) {

                if (Object.keys($tab_status[tid].error).length == 0) {
                    current_state = "warning"; 
                }
                
                log("not all urls are being enforced", 1, "enforce");
            }

            set_icon(current_state, tid);
        }
    },
    $config.filters
);

chrome.webRequest.onBeforeRedirect.addListener(
    function(data) {
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
            log("initializing extension...", 0, "install");
            save_options(); // write hard defaults
            break;
        case "update":
            log("initializing extension...", 0, "update");
            get_options();
            break;

    }
});

chrome.runtime.onStartup.addListener(function() {
    log("initializing extension...", 0, "startup");
    get_options();
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
        
        case 'save_options':
            save_options();
            sendResponse({
               message: "options saved"
            })
            break;
        
        case 'set_option':
            $options[req.key] = req.value;
                        
            sendResponse({
               message: "option '" + req.key + " = " + req.value + "' set"
            })
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
        log("ssle is not enabled...", -1, "ssle");    
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

    log("get " + type + " (by tab: " + tid + ") - fqdn: " + fqdn + ", uri: " + uri, -1, "nav");

    // check if our tab has initialized properly
    if ($tab_status[tid] == undefined) {
        init_tab(tid);
    }

    // if the tab navigates to a new main url, clear the tab status
    if (type == "main_frame" && tab_has_status(tid)) {
        log("nav to new main_frame, tab_status for tab " + tid + " reset", -1, "nav");
        uninit_tab(tid);
        init_tab(tid);
    }

    enforcement = enforce_match(fqdn, uri);
    switch (enforcement) {
        case -4:
            status_msg = "rule matched for '" + fqdn + "' but enforcement is explicitly disabled";
            push_tab_status("warning", tid, enforcement, {
                url: fqdn + uri,
                msg: status_msg
            });

            log(status_msg, 1, "enforce");
            break;

        case -3:
            status_msg = "fqdn '" + fqdn + "' matched but uri did not";
            push_tab_status("warning", tid, enforcement, {
                url: fqdn + uri,
                msg: status_msg
            });

            log(status_msg, 1, "enforce");
            break;

        case -1:
            status_msg = "domain for '" + fqdn + "' matched but subdomains are not enforced";
            push_tab_status("warning", tid, enforcement, {
                url: fqdn + uri,
                msg: status_msg
            });

            log(status_msg, 1, "enforce");
            break;

        case 0:
            if (url.is_https()) {
                status_msg = "url '" + fqdn + uri + "' is already https";
                push_tab_status("enforced", tid, 4, {
                    url: fqdn + uri,
                    msg: status_msg
                });

                log(status_msg, 1, "enforce");
            } else {
                status_msg = "not enforcing SSL for fqdn: " + fqdn;
                push_tab_status("disabled", tid, enforcement, {
                    url: fqdn + uri,
                    msg: status_msg
                });

                log(status_msg, 1, "enforce");
            }
            break;

        case 1:
            status_msg = "domain '*." + fqdn.url_parse("domain") + "' matched for enforcement: " + secure_url;
            push_tab_status("enforced", tid, enforcement, {
                url: fqdn + uri,
                msg: status_msg
            });

            log(status_msg, 1, "enforce");
            return (url.is_https() ? { cancel: false } : flood_check(fqdn + uri, secure_url, tid));
            break;

        case 2:
            status_msg = "fqdn '" + fqdn + "' matched for enforcement: " + secure_url;
            push_tab_status("enforced", tid, enforcement, {
                url: fqdn + uri,
                msg: status_msg
            });

            log(status_msg, 1, "enforce");
            return (url.is_https() ? { cancel: false } : flood_check(fqdn + uri, secure_url, tid));
            break;

        case 3:
            status_msg = "fqdn '" + fqdn + "' and uri '" + uri + "' matched for enforcement: " + secure_url;
            push_tab_status("enforced", tid, enforcement, {
                url: fqdn + uri,
                msg: status_msg
            });

            log(status_msg, 1, "enforce");
            return (url.is_https() ? { cancel: false } : flood_check(fqdn + uri, secure_url, tid));
            break;

        default:
            break;
    }

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

    if ($flood[url] == undefined) {
        log("url not tracked, initializing: " + url, -1, "flood");
        $flood[url] = { hits: 1 };
        setTimeout(function() {
            if ($flood[url] != undefined) {
                log("tracking expired for: " + url, -1, "flood");
                delete $flood[url];
            }
        }, $options.flood.ms);

    } else if ($flood[url].hits > $options.flood.hits) {
        status_msg = "url is flooding, will not enforce SSL (" + $flood[url].hits + " hits in " + $options.flood.ms + "ms): " + url;

        push_tab_status("error", tid, -2, {
            url: url,
            msg: status_msg
        });

        log(status_msg, 1, "flood");
        return { cancel: false };
    } else {
        $flood[url].hits++;
    }

    return { redirectUrl: secure_url };
}


/**
 * return int that indicates type of match
 *
 * @see common.js/$config.state_reason
 */
function enforce_match(fqdn, uri) {
    var domain = fqdn.url_parse("domain"); // xyz.www.test.com -> test.com

    if ($ssle.dont_enforce[domain] != undefined) {
        if ($ssle.dont_enforce[domain].uri != "") { // uri must match to skip enforcement
            if ($ssle.dont_enforce[domain].uri instanceof RegExp
                && $ssle.dont_enforce[domain].uri.test(uri)) {
                return -4; // regex for uri matched
            }
            if ($ssle.dont_enforce[domain].uri == uri) {
                return -4; // exact uri match
            }
        } else if ($ssle.dont_enforce[domain].uri == "") {
            return -4;
        }
    }
    if ($ssle.dont_enforce[fqdn] != undefined) {
        if ($ssle.dont_enforce[fqdn].uri != "") { // uri must match to skip enforcement
            if ($ssle.dont_enforce[fqdn].uri instanceof RegExp
                && $ssle.dont_enforce[fqdn].uri.test(uri)) {
                return -4; // regex for uri matched
            }
            if ($ssle.dont_enforce[fqdn].uri == uri) {
                return -4; // exact uri match
            }
        } else if ($ssle.dont_enforce[fqdn].uri == "") {
            return -4;
        }
    }
    
    if ($ssle.enforcement[domain] != undefined) {
        if ($ssle.enforcement[domain].subdomains == 0
            && domain != fqdn) {
            return -1;
        }
        if ($ssle.enforcement[domain].uri != "") {
            if ((typeof($ssle.enforcement[domain].uri) == "string"
                && $ssle.enforcement[domain].uri == uri)
                ||
                ($ssle.dont_enforce[domain].uri instanceof RegExp
                && $ssle.dont_enforce[domain].uri.test(uri))) {
                return 3;
            }
            return -3;
        }
        return 1;
    }
    if ($ssle.enforcement[fqdn] != undefined) {
        if ($ssle.enforcement[fqdn].uri != "") {
            if (((typeof($ssle.enforcement[fqdn].uri) == "string"
                && $ssle.enforcement[fqdn].uri == uri)
                ||
                $ssle.dont_enforce[fqdn].uri instanceof RegExp
                && $ssle.dont_enforce[fqdn].uri.test(uri))) {
                return 3;
            }
            return -3;
        }
        return 2;
    }
    return 0;
}

/**
 * write url enforcement information to tab_status
 */
function push_tab_status(state, tid, reason, data) {
    log("pushed status to tab "+ tid +"("+state+"): "+ JSON.stringify(data), -1, "tabs");
    if ($tab_status[tid][state][reason] == undefined) {
        $tab_status[tid][state][reason] = [];
    }
    
    if (tab_reason_url_count(tid, state, reason) > $options.max_tab_status) {
        status_msg = "tab status count exceeded " + $options.max_tab_status + ", ssle will cease reporting on new urls but will continue to enforce";   
        log(status_msg, 2, "ssle");
    } else {
        $tab_status[tid][state][reason].push(data);
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
    if ($tab_status[tid] != undefined) {
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
    if ($tab_status[tid] != undefined) {
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
    
    log("tab_status for "+ tid +" initialized", -1, "tabs");
}

/**
 * options handlers
 */
function get_options(callback) {
    $storage.get("options", function(items) {
        if (chrome.runtime.lastError != undefined)
            log("error on storage.get: " + JSON.stringify(chrome.runtime.lastError), 2, "storage");

        if (items.options == undefined) {
            log("no options in storage, using hard defaults", 0, "storage");
        }
        else {
            $options = items.options;
            update_badge_text();
            
            log("options retrieved from storage (" + STORAGE_TYPE + ")", 0, "storage");
        }

        if (callback != undefined)
            callback(items);
    });
}

function save_options(callback) {
    $storage.set({options: $options}, function() {
        log("options saved to storage (" + STORAGE_TYPE + ")", 0, "storage");

        if (callback != undefined)
            callback();
    });
}
