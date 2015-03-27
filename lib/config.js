/**
 * SKN SSLE
 *
 * @author  Adrian@Slacknet
 * @license http://www.gnu.org/licenses/gpl-3.0.txt GPLv3
 */

var AppConfig = {
    LOG_LEVEL: -2,
    STORAGE_TYPE: 'sync', // 'sync' or 'local'

    OPTIONS_DEFAULTS: {
        ssle_enabled: 1,
        log_level: 3,
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
                '^[a-z0-9\\-\\.]*imgur\\.com/.*$': { id: "i9ad4b56e" },
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
    },

    CONFIG: {
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
            "0,": "Not enforced due to flooding",
            "-1": "Enforcement explicitly disabled",
            "0": "No rules matched",
            "1": "Rule matched for enforcement",
            "2": "URL was accessed via HTTPS",
        },
    }
}
