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
    populate_rules('#folder_enforce', $options.ssle.enforce);
    populate_rules('#folder_exclude', $options.ssle.exclude);

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

    $('#ext_export_options')
        .text('Export Options')
        .on("click", function() {
            export_options();
        });
    $('#ext_import_options')
        .text('Import Options')
        .on("click", function() {
            show_popup('#popup_import_options');
        });

    $('#rule_add_enforce, #rule_add_exclude')
        .on("click", function() {
            var rule_type = $(this).attr('id').split(/_/)[2];

            $('#rule_pattern, #rule_id').val('');
            $('#rule_type').val(rule_type);

            $('#rule_delete').addClass('hidden');
            show_popup('#popup_rule');
            $('#rule_pattern').focus();
        });

    $('#rule_delete')
        .text('Delete Rule')
        .on("click", function() {
            if (confirm('Are you sure you want to delete this rule?')) {
                var rule_id = $('#rule_id').val();
                delete_rule_entry(rule_id);
                hide_popup('#popup_rule');
            }
        });

    $('#rule_save')
        .text('Save Rule')
        .on("click", function() {

            var save_type = $('#rule_type').val();
            var save_pattern = $('#rule_pattern').val();

            if (typeof save_pattern == 'undefined'
                || save_pattern == "") {
                $('#rule_pattern').addClass("ui_value_error").focus();
                alert("Invalid regex pattern (cannot be blank)");
                setTimeout(function() { $('#rule_pattern').removeClass('ui_value_error'); }, 700);
                return false;
            }

            var save_id = $('#rule_id').val();
            if (save_id == "") {
                if (typeof $options.ssle[save_type][save_pattern] != 'undefined') {
                    $('#rule_pattern').addClass("ui_value_error").focus();
                    alert("A rule for '" + save_pattern + "' already exists in the '" + save_type + "' ruleset.");
                    setTimeout(function() { $('#rule_pattern').removeClass('ui_value_error'); }, 700);
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
                    rule_pattern: save_pattern,
                    value: {
                        id: save_id
                    }
                }, function (data) {
                    message_received(data);

                    chrome.extension.sendRequest({type: 'save_options'}, function(data) {
                        options_saved(data);

                        $('#' + save_id).remove();
                        create_rule_record('#folder_' + save_type, save_pattern, { id: save_id });
                        $('#' + save_id).hide();
                        $('#' + save_id).addClass('message');
                        $('#' + save_id).fadeIn('fast');

                        setTimeout(function() {
                            $('#' + save_id).hide();
                            $('#' + save_id).removeClass('message');
                            $('#' + save_id).fadeIn('fast');
                        }, 700);

                        hide_popup('#popup_rule');

                        $('#rule_save')
                            .removeClass("message")
                            .text('Save Rule');
                    });
                }
            );

            return true;
        });

    $('#import_options')
        .text('Import Options')
        .on("click", function() {
            import_options();
        });

    $('#rule_cancel')
        .text('Cancel')
        .on("click", function() {
            hide_popup('#popup_rule');
        });
    $('#import_cancel')
        .text('Cancel')
        .on("click", function() {
            hide_popup('#popup_import_options');
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

    ui_attach_checkbox($('#option_verbose_tab'), { on: $options.verbose_tab,
        callback: function() {
            chrome.extension.sendRequest({type: 'set_option', key: 'verbose_tab', value: $('#option_verbose_tab_ui_checkbox').data('is_checked') }, message_received);
            chrome.extension.sendRequest({type: 'save_options'}, options_saved);
        }
    });

    for (var flag in $config.allowed_regex_flags) {
        ui_attach_checkbox($('#option_regex_flags_' + flag), { on: ($options.regex_flags.match(flag) ? 1 : 0), check_text: flag, uncheck_text: "\u2006", title: $config.allowed_regex_flags[flag],
            callback: function() {
                var regex_flags_value = "";
                for (var val in $config.allowed_regex_flags) {
                    regex_flags_value += ($('#option_regex_flags_' + val + '_ui_checkbox').data('is_checked') == 1 ? val : '');
                }
                chrome.extension.sendRequest({type: 'set_option', key: 'regex_flags', value: regex_flags_value }, message_received);
                chrome.extension.sendRequest({type: 'save_options'}, options_saved);
            }
        });
    }
}

function populate_rules(div_id, rules) {
    for (var rule in rules) {
        create_rule_record(div_id, rule, rules[rule])
    }
}

function create_rule_record(div_id, rule, ruleobj) {
    $(div_id).prepend(
        $('<div>')
            .addClass('table')
            .addClass('padded')
            .addClass('highlight')
            .addClass('buttonize')

            .attr('id',ruleobj.id)

            .append(
                $('<label>')
                    .addClass('padded')
                    .addClass('buttonize')
                    .append(
                        $('<span>')
                            .addClass('padded')
                            .text(rule)
                    )
            )
            .on('click', function() {
                edit_rule_entry($(this).attr('id'));
            })
    );
}

function write_info(text) {
    $('#info')
        .text(text)
        .show('fast');

    setTimeout(function() { $('#info').hide('fast'); }, 5000);
}

function ui_attach_checkbox(obj, settings) {
    var check_text = settings.check_text != undefined ? settings.check_text : '\u2714'; // checkmark
    var uncheck_text = settings.uncheck_text != undefined ? settings.uncheck_text : '\u2006'; // blank

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
                $(this).data("is_checked", ($(this).text() == check_text ? 1 : 0));
                if (settings.callback != undefined) {
                    settings.callback();
                }
            })
    );
}

function ui_attach_value_changer(obj, settings) {
    var up_text = settings.up_text != undefined ? settings.up_text : '+'; //'\u039B';
    var down_text = settings.down_text != undefined ? settings.down_text : '-'; //'V';

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

function delete_rule_entry(delete_id) {
    var record = select_record_by_id(delete_id);
    if (typeof record != "undefined") {
        $('#' + delete_id)
            .addClass('warning')
            .fadeOut('fast');

        log("rule type '" + record.type + "' with id '" + delete_id + "' was deleted", -1, "opt");
        chrome.extension.sendRequest({type: 'delete_rule', id: delete_id, rule_type: record.type, rule_entry: record.entry}, message_received);
        chrome.extension.sendRequest({type: 'save_options'}, options_saved);
    } else {
        log("rule with id '" + delete_id + "' not found for deletion", 2, "rule");
    }
}

function edit_rule_entry(edit_id) {
    var record = select_record_by_id(edit_id);
    if (typeof record != "undefined") {

        $('#rule_id').val($options.ssle[record.type][record.entry].id);
        $('#rule_type').val(record.type);

        $('#rule_pattern').val(record.entry);

        $('#rule_title').text('Edit ' + (record.type == "exclude" ? "Exclusion" : "Enforcement") + ' Rule');

        $('#rule_delete').removeClass('hidden');
        show_popup('#popup_rule');
        $('#rule_pattern').focus();
    } else {
        log("rule with id '" + edit_id + "' not found for edit", 2, "rule");
    }
}

function options_saved(data) {
    if (typeof data.options != 'undefined') {
        log("options data returned with 'save_options' confirmation message", -1, "opt");
        $options = data.options;
    }
    message_received(data);

    write_info("Options successfully saved to storage!");
}

function export_options() {
    var filename = 'ssle_options.json';
    var data = encodeURIComponent(JSON.stringify($options));
    $('body').append(
        $('<a>')
            .attr('id', 'export_options')
            .attr('href','data:text/plain;charset=utf-8,' + data)
            .attr('download', filename)
    );
    $('#export_options')[0].click();
    $('#export_options').remove();
}

function cleanup_imported_options(data) {
    var json = null;
    try {
        json = JSON.parse(data)
    } catch (e) {
        alert('File import failed: ' + e);
        return false;
    }
    if (typeof json == 'object') {
        for (var key in json) { // sanity check
            if (typeof $options[key] == undefined) {
                delete json[key];
            }
        }
    }
    log("import options cleanup: " + JSON.stringify(json), -2, "import");
    return json;
}

/**
 * got this from: https://groups.google.com/a/chromium.org/forum/#!topic/chromium-extensions/cvC-kCVjDuE
 */
function import_options() {
    var files = $('#import_options_file')[0].files;

    if (!(files instanceof FileList) || files.length === 0){
        alert('Please select an options file to import (JSON format)');
        return false;
    }

    if (files[0].size > $config.max_import_filesize) {
        alert('Options file too large. Limit: ' + ($config.max_import_filesize / 1024).toFixed(0) + 'KB');
        return false;
    }

    var read = new FileReader();

    // import only when file has finished loading
    read.onloadend = (function(file){
        return function(e) {
            // import_options() will do a sanity check before writing to memory
            var clean_options = cleanup_imported_options(e.target.result);
            if (clean_options) { // e.target.result is the content
                $('#import_options').text('Importing...');
                chrome.extension.sendRequest({type: 'import_options', options: clean_options}, function(data) {
                    message_received(data);
                    window.location.reload();
                });
            }
        }
    })(files[0]); // files[0] assumes only one file has been selected

    return read.readAsText(files[0]);
}
