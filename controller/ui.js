/**
 * SKN SSLE
 *
 * @author  Adrian@Slacknet
 * @license http://www.gnu.org/licenses/gpl-3.0.txt GPLv3
 */

/**
 * UI controller
 *
 * @class
 * @extends EchoesObject
 */
function SknUi() {
    SknObject.call(this, 'ui');

    this.ui = {
        popup: {
            window: $('#popup'),
            title: $('#popup_title'),
            message: $('#popup_message'),
            wrapper: $('#popup_wrapper'),
            yes: $('#popup_yes'),
            no: $('#popup_no'),
        },
        progress_bar: $('#progress_bar'),
        ext_popup: {
            main: $('#main'),
            ext_state: $('#ext_state'),
        },
    }
}
SknUi.prototype = Object.create(SknObject.prototype);
SknUi.prototype.constructor = SknUi;

/**
 * Scrolls the window down
 *
 * @returns {null}
 */
SknUi.prototype.scroll_down = function() {
    var win = $('<body>');
    win.scrollTop(win.prop("scrollHeight"));
};

/**
 * Displays a popup with an optional title or message
 *
 * If a yes_/no_callback is specified, it is called before popup_close() on 'click'
 *
 * If no "no" button text is specified, the button is hidden
 * The "yes" button text will default to "CLOSE"
 *
 * @param   {string} title     (optional) Title of popup
 * @param   {string} message    (optional) Message to display
 * @param   {string} yes_text     (optional) Text to display in YES button
 * @param   {string} no_text      (optional) Text to display in NO button
 * @param   {function} yes_callback (optional) Function to call after YES onclick
 * @param   {function} no_callback  (optional) Function to call after NO onclick
 * @param   {string} prebuilt_popup_id  (optional) Show a prebuilt popup and exit
 *
 * @returns {null}
 */
SknUi.prototype.popup = function(title, message, yes_text, no_text, yes_callback, no_callback, prebuilt_popup_id) {
    if (typeof prebuilt_popup_id == 'string') {
        $(prebuilt_popup_id).show();
        this.popup_center(prebuilt_popup_id);
        return;
    }

    var self = this;

    this.ui.popup.no.off('click');
    this.ui.popup.yes.off('click');

    if (title) {
        this.ui.popup.title.show().text(title);
    } else {
        this.ui.popup.title.hide();
    }
    if (typeof message == 'string') {
        if (message.length > 0) {
            this.ui.popup.message.text(message);
        }
        this.ui.popup.message.show();
    } else {
        this.ui.popup.message.hide();
    }

    this.ui.popup.yes.show().text(yes_text || "CLOSE");
    this.ui.popup.yes.on('click', function() {
        if (typeof yes_callback == 'function') {
            yes_callback();
        } else {
            self.popup_close();
        }
    });

    if (no_text) {
        this.ui.popup.no.show().text(no_text);
        this.ui.popup.no.on('click', function() {
            if (typeof no_callback == 'function') {
                no_callback();
            } else {
                self.popup_close();
            }
        });
    } else {
        this.ui.popup.no.hide();
    }

    this.ui.popup.window.show();
    this.popup_center();
};

/**
 * Close the popup window
 *
 * @returns {null}
 */
SknUi.prototype.popup_close = function(id) {
    var p = typeof id == 'string' ? $(id) : this.ui.popup.window;

    p.hide();
};

/**
 * Align popup wrapper to center of window
 *
 * @returns {null}
 */
SknUi.prototype.popup_center = function(id) {
    var p = typeof id == 'string' ? $(id).find('div:first') : this.ui.popup.wrapper;

    // center div
    p.css('margin-top', -p.outerHeight()/2 + 'px');
    p.css('margin-left', -p.outerWidth()/2 + 'px');
};

/**
 * Display progress with the appropriate percent
 *
 * percent value of -1 or 101 will hide the progress bar
 *
 * @param   {int}   percent The progress percent
 *
 * @returns {null}
 */
SknUi.prototype.progress = function(percent) {
    if (percent < 0
        || percent > 100) {
        this.ui.progress_bar.fadeOut('fast');
    } else {
        this.ui.progress_bar.fadeIn('fast');
    }
    this.ui.progress_bar.attr('value', percent);
};


SknUi.prototype.draw_state = function(state, state_data) {
    for (var reason in state_data) {
        var urls = state_data[reason];

        var state_urls_folder = this.ui.ext_popup.main
            .append(
                $('<div>')
                    .attr('id','state_' + state)
                    .text(AppConfig.CONFIG.state_reason[reason])

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

        this.log(state + " state url count: " + urls.length, 1, 'state');
        for (var u = 0; u < urls.length; u++) {
            var fullurl = urls[u].url;
            var url = this.limit(fullurl, 60);
            var fulluri = this.url_parse(urls[u].url, "uri");
            var matched_pattern = typeof urls[u].pattern != "undefined" ? "Rule: " + urls[u].pattern : '';

            var fqdn = this.url_parse(url, "fqdn");
            var uri = this.url_parse(url, "uri");
            var domain = this.url_parse(fqdn, "domain");

            this.log("processing url: " + fullurl, 0, 'state');

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

SknUi.prototype.set_ssle = function(on_off) {
    this.ui.ext_popup.ext_state
        .addClass(on_off ? "button_on" : "button_off")
        .removeClass(on_off ? "button_off" : "button_on")
        .text(on_off ? "Enabled" : "Disabled");
}
