var $popup = new SknObject('popup');

$(document).ready(function($) {
    chrome.extension.sendRequest({type: 'gimmie_options'}, function(ret) {
        $popup.options = ret.options;
        $popup.config = AppConfig.CONFIG;

        $popup.log("retrieved options and config from bg", 0, 'init');

        initialize_page();
    });
});

function initialize_page() {
    var ext_name = chrome.app.getDetails().name;
    var ext_version = chrome.app.getDetails().version;

    $('#ext_name').text(ext_name);
    $('#ext_version').text(ext_version);

    $('#ext_state')
        .addClass($popup.options.ssle_enabled ? "button_on" : "button_off")

        .text($popup.options.ssle_enabled ? "Enabled" : "Disabled")
        .on("click", toggle_ssle);

    $('#ext_options')
        .text("Options")
        .on("click", function() {
            chrome.tabs.create({'url': chrome.extension.getURL('html/options.html')});
        });

    document.title = ext_name + " (" + ext_version + ") Popup";

    chrome.windows.getCurrent(function(w) {
        chrome.tabs.query({windowId: w.id, highlighted: true}, function(t) {
            var current_tid = t[0].id; // there should only be one highlighted tab in the current window.

            $popup.log("fetching tab status for tab with id: " + current_tid, 1, 'tab');
            chrome.extension.sendRequest({
                    type: 'gimmie_status',
                    tid: current_tid
                },
                write_tab_status
            );
        });
    });
}

function write_tab_status(ts) {
    var data = ts.data;
    var priority_states = prioritize_states(); // array of states, prioritized by weight

    $popup.log("gimmie_status: " + JSON.stringify(data), 0, 'tab');

    for (var s = 0; s < priority_states.length; s++) {
        var state = priority_states[s];
        var state_data = data[state];

        if (Object.keys(state_data).length > 0) {
            $popup.log("writing tab status for state: " + state, 1, 'tab');
            draw_state(state, state_data);
        } else {
            $popup.log("no urls for state: " + state, 2, 'tab');
        }
    }
}

function draw_state(state, state_data) {
    for (var reason in state_data) {
        var urls = state_data[reason];

        var state_urls_folder = $("#main")
            .append(
                $('<div>')
                    .attr('id','state_' + state)
                    .text($popup.config.state_reason[reason])

                    .addClass('padded')
                    .addClass('folder')
                    .addClass('state_' + state)
                    .addClass('buttonize')
                    .on("click", function() {
                        $(this).next('div').slideToggle('fast');
                    })
                ,
                $('<div>')
                    .attr('id','folder_state_' + state)

                    .addClass('folder_state_' + state)
                    .addClass('hidden')
            )
            .children(':last');

        $popup.log(state + " state url count: " + urls.length, 1, 'state');
        for (var u = 0; u < urls.length; u++) {
            var fullurl = urls[u].url;
            var url = $popup.limit(fullurl, 75);
            var fulluri = $popup.url_parse(urls[u].url, "uri");
            var matched_pattern = typeof urls[u].pattern != "undefined" ? "Rule: " + urls[u].pattern : '';

            var fqdn = $popup.url_parse(url, "fqdn");
            var uri = $popup.url_parse(url, "uri");
            var domain = $popup.url_parse(fqdn, "domain");

            $popup.log("processing url: " + fullurl, 0, 'state');

            var domain_div_id = 'state_' + state + '_' + reason + '_' + domain;

            var domain_div =
                $('div [id="' + domain_div_id + '"]').is('div')
                    ? $('div [id="' + domain_div_id + '"]')
                    : state_urls_folder
                        .append(
                            $('<div>')
                                .attr('id',domain_div_id)
                                .addClass('domain')
                                .addClass('buttonize')
                                .text(domain)

                                .on("click", function() {
                                    $(this).next('div').slideToggle('fast');
                                })
                        )
                        .children(':last');

            var domain_folder_div =
                $('div [id="folder_' + domain_div_id + '"]').is('div')
                    ? $('div [id="folder_' + domain_div_id + '"]')
                    : state_urls_folder
                        .append(
                            $('<div>')
                                .attr('id','folder_' + domain_div_id)
                                .addClass('folder_domain')
                                .addClass('hidden')
                        )
                        .children(':last');

            domain_folder_div
                .append(
                    $('<div>')
                    .addClass('fullurl')
                    .attr('title', matched_pattern)
                    .append(
                        $('<span>')
                            .addClass('fqdn')
                            .text(fqdn)
                        ,
                        $('<span>')
                            .attr('title',fulluri)
                            .addClass('uri')
                            .text(uri)
                    )
                );
        }
    }
}

function toggle_ssle() {
    $popup.options.ssle_enabled = ($popup.options.ssle_enabled ? 0 : 1);
    $('#ext_state')
        .addClass($popup.options.ssle_enabled ? "button_on" : "button_off")
        .removeClass(!$popup.options.ssle_enabled ? "button_on" : "button_off")
        .text($popup.options.ssle_enabled ? "Enabled" : "Disabled");

    chrome.extension.sendRequest({type: 'set_option', key: 'ssle_enabled', value: $popup.options.ssle_enabled}, function() {
        chrome.extension.sendRequest({type: 'save_options'}, $popup.message_received);
    });
}

/**
 * return array of states sorted by descending weight
 */
function prioritize_states() {
    var stateSortArr = [];
    for (var stateName in $popup.config.states) {
        stateSortArr.push({ name: stateName, weight: $popup.config.states[stateName].weight });
    }

    stateSortArr.sort(function(a, b) { return b.weight - a.weight; }); //b - a for descending sort
    return stateSortArr.map(function(state) { return state.name; });
}
