var $options = {};
var $config = {};

$(document).ready(function($) {
    chrome.extension.sendRequest({type: 'gimmie_config_and_options'}, function(ret) {
        log("retrieved $options and $config from background.js", -2, "debug");
        $options = ret.options;
        $config = ret.config;
        
        initialize_popup();
    });
    

});

function initialize_popup() {
    var ext_name = chrome.app.getDetails().name;
    var ext_version = chrome.app.getDetails().version;
    
    $('#ext_name').text(ext_name);
    $('#ext_version').text(ext_version);
    $('#ext_state')
        .addClass("buttonize")
        .addClass($options.ssle_enabled ? "button_on" : "button_off")
        .text($options.ssle_enabled ? "Enabled" : "Disabled")
        .on("click", toggle_ssle);

    $('#ext_options')
        .addClass("buttonize")
        .addClass("button_neutral")
        .text("Options")
        .on("click", function() {
            chrome.tabs.create({'url': chrome.extension.getURL('html/options.html')});
        });
        
    document.title = ext_name + " (" + ext_version + ") Popup";
    
    chrome.windows.getCurrent(function(w) {
        chrome.tabs.query({windowId: w.id, highlighted: true}, function(t) {
            var current_tid = t[0].id; // there should only be one highlighted tab in the current window.

            chrome.extension.sendRequest({
                    type: 'gimmie_status',
                    tid: current_tid
                },
                write_tab_status
            );
        });
    });
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

function write_tab_status(ts) {
    var data = ts.data;
    var priority_states = prioritize_states(); // array of states, prioritized by weight

    log("gimmie_status: " + JSON.stringify(data), -3, "debug");

    for (var s = 0; s < priority_states.length; s++) {
        var state = priority_states[s];
        var state_data = data[state];

        if (Object.keys(state_data).length > 0) {
            draw_state(state, state_data);
        } else {
            log("no urls for state: " + state, -1, "popup");
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
                    .text($config.state_reason[reason])

                    .addClass('state_common')
                    .addClass('state_' + state)
                    .addClass('buttonize')
                    .on("click", function() {
                        $(this).next('div').toggle('fast');
                    })
            )
            .append(
                $('<div>')
                    .attr('id','folder_state_' + state)

                    .addClass('folder_state_' + state)
                    .addClass('hidden')
            )
            .children(':last');
        
        log(state + " state url count: " + urls.length, -2, "debug");
        for (var u = 0; u < urls.length; u++) {
            var fullurl = urls[u].url;
            var url = fullurl.limit(75);
            var fulluri = urls[u].url.url_parse("uri");

            var fqdn = url.url_parse("fqdn");
            var uri = url.url_parse("uri");
            var domain = fqdn.url_parse("domain");
            
            log("popup, processing url: " + fullurl, -2, "debug")

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
                                    $(this).next('div').toggle('fast');
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
                    .append(
                        $('<span>')
                            .addClass('fqdn')
                            .text(fqdn)
                    )
                    .append(
                        $('<span>')
                            .attr('title',fulluri)
                            .addClass('uri')
                            .text(uri)
                    )
                );
        }
    }
}
