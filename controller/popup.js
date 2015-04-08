var $popup = null;
var $ui = null;

$(document).ready(function($) {
    $popup = new SknObject('popup');
    $ui = new SknUi();

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

    $ui.set_ssle($popup.options.ssle_enabled);
    $ui.ui.ext_popup.ext_state.on("click", toggle_ssle);

    $('#ext_options')
        .text("Options")
        .on("click", function() {
            chrome.tabs.create({'url': chrome.extension.getURL('view/options.html')});
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
            $ui.draw_state(state, state_data);
        } else {
            $popup.log("no urls for state: " + state, 2, 'tab');
        }
    }
}

function toggle_ssle() {
    $popup.options.ssle_enabled = ($popup.options.ssle_enabled ? 0 : 1);

    $ui.set_ssle($popup.options.ssle_enabled);

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
