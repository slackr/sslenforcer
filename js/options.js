var $options = {};
var $config = {};

$(document).ready(function($) {
    chrome.extension.sendRequest({type: 'gimmie_config_and_options'}, function(ret) {
        log("retrieved $options and $config from background.js", -2, "debug");
        $options = ret.options;
        $config = ret.config;
        
        initialize_page();
    });
});

function initialize_page() {
    var ext_name = chrome.app.getDetails().name;
    var ext_version = chrome.app.getDetails().version;
    
    $('#ext_name').text(ext_name);
    $('#ext_version').text(ext_version);

    document.title = ext_name + " (" + ext_version + ") Options";
    
    populate_options();
}

function populate_options() {
    populate_urls('#folder_enforce', $options.ssle.enforce);
    populate_urls('#folder_exclude', $options.ssle.exclude);
    
    $('#advanced_options, #enforce, #exclude').on("click", function() {
        $(this).next('div').toggle('fast');
    });
    
    $('#ext_save_options')
        .text('Save Options')
        .on("click", function() {
            $(this).text('Saving...');
            chrome.extension.sendRequest({type: 'save_options'}, function(data) {
                $('#ext_save_options').text('Save Options');
                options_saved(data);
            });
        });

    $('#ext_restore_defaults')
        .text('Restore Defaults')
        .on("click", function() {
            if (confirm("Are you sure you want to revert to default options? All rules will be reset as well.")) {
                $(this).text('Restoring Defaults...');
                chrome.extension.sendRequest({type: 'restore_default_options'}, function(data) {
                    window.location.reload();
                });
            }
        });
    
    $('#rule_add_enforce, #rule_add_exclude')
        .on("click", function() {
            var rule_type = $(this).attr('id').split(/_/)[2];
            
            $('#rule_uri, #rule_fqdn, #rule_id').val('');
            $('#rule_subdomains_ui_checkbox').text($('#rule_subdomains_ui_checkbox').data("settings")['check_text']);
            
            $('#rule_type').val(rule_type);
            
            show_popup();
            
            $('#rule_fqdn').focus();
        });

    $('#rule_save')
        .text('Save Rule')
        .on("click", function() {
            
            var save_uri = $('#rule_uri').val();
            var save_type = $('#rule_type').val();
            var save_fqdn = $('#rule_fqdn').val();
            var save_subdomains = $('#rule_subdomains_ui_checkbox').data("is_checked");
            
            if (typeof save_fqdn == 'undefined'
                || save_fqdn == "") {
                $('#rule_fqdn').addClass("ui_value_error").focus();
                alert("Invalid FQDN (wikipedia.org, www.google.com)");
                setTimeout(function() { $('#rule_fqdn').removeClass('ui_value_error'); }, 700);
                return false;
            }
            
            var save_id = $('#rule_id').val();
            if (save_id == "") {
                if (typeof $options.ssle[save_type][save_fqdn] != 'undefined') {
                    $('#rule_fqdn').addClass("ui_value_error").focus();
                    alert("A rule for '" + save_fqdn + "' already exists in the '" + save_type + "' ruleset.");
                    setTimeout(function() { $('#rule_fqdn').removeClass('ui_value_error'); }, 700);
                    return false;
                }
                
                save_id = uniq_id();
            }
            
            $(this)
                .addClass("message")
                .text('Saving...');
            
            chrome.extension.sendRequest({
                    type: 'set_rule',
                    rule_type: save_type,
                    rule_fqdn: save_fqdn,
                    value: {
                        subdomains: save_subdomains,
                        uri: save_uri,
                        id: save_id
                    }
                }, function (data) {
                    message_received(data);
                    
                    chrome.extension.sendRequest({type: 'save_options'}, function(data) {
                        options_saved(data);
                        
                        $('#' + save_id).remove();
                        create_url_record('#folder_' + save_type, save_fqdn, { subdomains: save_subdomains, id: save_id, uri: save_uri });
                        $('#' + save_id).hide();
                        $('#' + save_id).addClass('message');
                        $('#' + save_id).fadeIn('fast');
                        
                        setTimeout(function() {
                            $('#' + save_id).hide();
                            $('#' + save_id).removeClass('message');
                            $('#' + save_id).fadeIn('fast');
                        }, 700);
                        
                        hide_popup();
                        
                        $('#rule_save')
                            .removeClass("message")
                            .text('Save Rule');
                    });
                }
            );
            
            return true; 
        });
        
    $('#rule_cancel')
        .text('Cancel')
        .on("click", function() {
            hide_popup();
        });
        
    $('#option_value_flood_hits').text($options.flood.hits);
    $('#option_value_flood_ms').text($options.flood.ms);
    $('#option_value_log_level').text($options.log_level);
    $('#option_value_max_tab_status').text($options.max_tab_status);
    
    ui_attach_value_changer($('#option_value_flood_hits'), { title: "Improper values may cause redirect loops on sites which insist on HTTP", inc_value: 1, lowest: 1, highest: 20,
        callback: function() {
            chrome.extension.sendRequest({type: 'set_option', key: 'flood', value: {
                hits: parseInt($('#option_value_flood_hits').text()),
                ms: parseInt($('#option_value_flood_ms').text())
            }}, message_received);
            chrome.extension.sendRequest({type: 'save_options'}, options_saved);
        }
    });
    ui_attach_value_changer($('#option_value_flood_ms'), { title: "Improper values may cause redirect loops on sites which insist on HTTP", inc_value: 100, lowest: 100, highest: 10000,
        callback: function() {
            chrome.extension.sendRequest({type: 'set_option', key: 'flood', value: {
                hits: parseInt($('#option_value_flood_hits').text()),
                ms: parseInt($('#option_value_flood_ms').text())
            }}, message_received);
            chrome.extension.sendRequest({type: 'save_options'}, options_saved);
        }
    });
    ui_attach_value_changer($('#option_value_log_level'), { title: "Low logging levels may have a negative impact on browser performance!", inc_value: 1, lowest: -2, highest: 3,
        callback: function() {
            chrome.extension.sendRequest({type: 'set_option', key: 'log_level', value: parseInt($('#option_value_log_level').text())}, message_received);
            chrome.extension.sendRequest({type: 'save_options'}, options_saved);
        }
    });
    ui_attach_value_changer($('#option_value_max_tab_status'), { title: "Higher limits may have a negative impact on browser performance!", inc_value: 10, lowest: 10, highest: 1000,
        callback: function() {
            chrome.extension.sendRequest({type: 'set_option', key: 'max_tab_status', value: parseInt($('#option_value_max_tab_status').text())}, message_received);
            chrome.extension.sendRequest({type: 'save_options'}, options_saved);
        }
    });
    
    ui_attach_checkbox($('#rule_subdomains'), { on: 1, check_text: "*.", uncheck_text: "\u2006", title: "Include subdomains?" });
}

function populate_urls(div_id, urls) {
    for (var entry in urls) {
        create_url_record(div_id, entry, urls[entry])
    }
}

function create_url_record(div_id, entry, entry_obj) {
    $(div_id).prepend(
        $('<div>')
            .addClass('table')
            .addClass('padded')
            .addClass('highlight')
            
            .attr('id',entry_obj.id)
            
            .hover(
                function() {
                    $(this)
                        .children('#hover_button_container')
                        .append(
                            $('<span>')
                                .addClass('buttonize')
                                .addClass('button_neutral')
                                .addClass('padded')
                                
                                .text('Edit')
                                
                                .on('click', function() {
                                    edit_url_entry($(this).closest('div').attr('id'));
                                })
                            ,
                            $('<span>')
                                .addClass('buttonize')
                                .addClass('button_neutral')
                                .addClass('padded')
                                
                                .text('Delete')
                                .on('click', function() {
                                    if (confirm('Are you sure?')) {
                                        delete_url_entry($(this).closest('div').attr('id'));
                                    }
                                })
                        )
                },
                function() {
                    $(this)
                        .children('#hover_button_container')
                        .text('')
                }                    
            )
            .append(
                $('<label>')
                    .addClass('padded')
                    .append(
                        $('<span>')
                            .addClass('padded')
                            .text((entry_obj.subdomains ? '*.' : '') + entry)
                        ,
                        $('<span>')
                            .addClass('uri')
                            .text(entry_obj.uri + (entry_obj.uri == "" ? '/*' : ''))
                    )
                ,
                $('<span>')
                    .addClass('padded')
                    .addClass('float_right')
                    .attr('id','hover_button_container')
            )
    );
}

function write_info(text) {
    $('#info')
        .text(text)
        .show('fast');
    
    setTimeout(function() { $('#info').hide('fast'); }, 5000);
}

function ui_attach_checkbox(obj, settings) {
    check_text = settings.check_text != undefined ? settings.check_text : '\u2714'; // checkmark
    uncheck_text = settings.uncheck_text != undefined ? settings.uncheck_text : '\u2006'; // blank
    
    obj.before(
        $('<span>')
            .attr('id',obj.attr('id') + '_ui_checkbox')
            .attr('title',settings.title != undefined ? settings.title : "")
            .addClass('buttonize')
            .addClass('button_neutral')
            .addClass('padded')
            .addClass('ui_box')
            .text(settings.on ? check_text : uncheck_text)
            .data('settings', { check_text: settings.check_text, uncheck_text: settings.uncheck_text })
            .data('is_checked', (settings.on ? 1 : 0))
            .on("click", function() {
                $(this).text($(this).text() == check_text ? uncheck_text : check_text);
                $(this).data("is_checked", ($(this).text() == settings.check_text ? 1 : 0));
                if (settings.callback != undefined) {
                    settings.callback();
                }
            })
    );
}

function ui_attach_value_changer(obj, settings) {
    up_text = settings.up_text != undefined ? settings.up_text : '+'; //'\u039B';
    down_text = settings.down_text != undefined ? settings.down_text : '-'; //'V';
    
    obj.after(
        $('<span>')
            .attr('id',obj.attr('id') + '_ui_value_down')
            .attr('title',settings.title != undefined ? settings.title : "")
            .addClass('buttonize')
            .addClass('button_neutral')
            .addClass('padded')
            .addClass('ui_box')
            .text(down_text)
            .on("click", function() {
                var value = parseInt(obj.text());
                if (value > settings.lowest) {
                    obj.text(value - settings.inc_value);
                    if (settings.callback != undefined) {
                        settings.callback();
                    }
                } else {
                    obj.addClass('ui_value_error')
                    setTimeout(function() {
                        obj.removeClass('ui_value_error')
                    }, 500);
                }
            })
        , // ).before(
        $('<span>')
            .attr('id',obj.attr('id') + '_ui_value_up')
            .attr('title',settings.title != undefined ? settings.title : "")
            .addClass('buttonize')
            .addClass('button_neutral')
            .addClass('padded')
            .addClass('ui_box')
            .text(up_text)
            .on("click", function() {
                var value = parseInt(obj.text());
                if (value < settings.highest) {
                    obj.text(value + settings.inc_value);
                    if (settings.callback != undefined) {
                        settings.callback();
                    }
                } else {
                    obj.addClass('option_value_error')
                    setTimeout(function() {
                        obj.removeClass('option_value_error')
                    }, 500);
                }
            })
    );
}

function delete_url_entry(delete_id) {
    var record = select_record_by_id(delete_id);
    if (typeof record != "undefined") {
        $('#' + delete_id)
            .addClass('warning')
            .fadeOut('fast');
                        
        log("url type '" + record.type + "' with id '" + delete_id + "' was deleted", -1, "opt");
        chrome.extension.sendRequest({type: 'delete_rule', id: delete_id, rule_type: record.type, rule_entry: record.entry}, message_received);
        chrome.extension.sendRequest({type: 'save_options'}, options_saved);
    } else {
        log("record with id '" + delete_id + "' not found for deletion", 2, "rule");
    }
}

function edit_url_entry(edit_id) {
    var record = select_record_by_id(edit_id);
    if (typeof record != "undefined") {
        
        $('#rule_id').val($options.ssle[record.type][record.entry].id);
        $('#rule_type').val(record.type);
                        
        $('#rule_fqdn').val(record.entry);
        $('#rule_uri').val($options.ssle[record.type][record.entry].uri);
        
        $('#rule_subdomains_ui_checkbox').text(
            $('#rule_subdomains_ui_checkbox').data("settings")[($options.ssle[record.type][record.entry].subdomains ? "check_text" : "uncheck_text")]
        );
        
        
        $('#rule_title').text('Edit ' + (record.type == "exclude" ? "Exclusion" : "Enforcement") + ' Rule');
        
        show_popup();
        $('#rule_fqdn').focus();
    } else {
        log("record with id '" + edit_id + "' not found for edit", 2, "rule");
    }
}

function options_saved(data) {
    if (typeof data.options != 'undefined') {
        log("options data returned with 'save_options' confirmation message", -1, "opt");
        $options = data.options;
    }
    message_received(data);
    
    write_info("Options successfully saved!");
}