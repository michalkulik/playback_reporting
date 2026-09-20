/*
Copyright(C) 2018

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see<http://www.gnu.org/licenses/>.
*/

function getConfigurationPageUrl(name) {
    return 'configurationpage?name=' + encodeURIComponent(name);
}

function getDefautColours() {
    return ["#d98880", "#c39bd3", "#7fb3d5", "#76d7c4", "#7dcea0", "#f7dc6f", "#f0b27a", "#d7dbdd", "#85c1e9", "#f1948a"];
}

function getTabs() {
    return [
        { href: getConfigurationPageUrl('activity_report'), name: 'Active' },
        { href: getConfigurationPageUrl('user_playback_report'), name: 'Playback' },
        { href: getConfigurationPageUrl('user_report'), name: 'Users' },
        { href: getConfigurationPageUrl('user_play_report'), name: 'Summary' },
        { href: getConfigurationPageUrl('breakdown_report'), name: 'Breakdown' },
        { href: getConfigurationPageUrl('hourly_usage_report'), name: 'Time' },
        { href: getConfigurationPageUrl('played'), name: 'Played' },
        { href: getConfigurationPageUrl('custom_query'), name: 'Query' },
        { href: getConfigurationPageUrl('playback_report_settings'), name: 'Settings' }
    ];
}

function getTabIndex(tab_name) {
    var tabs = getTabs();
    for (var index = 0; index < tabs.length; ++index) {
        if (tabs[index].href.endsWith('=' + tab_name)) {
            return index;
        }
    }
    return -1;
}

// Jellyfin renders the section tabs into the shared header and upgrades them with the
// legacy CustomElements polyfill. Not every client provides it (notably the mobile
// wrapper), and when the upgrade does not happen the strip overflows without scrolling
// and the layout class stays off. Restore both with the very fallback Jellyfin uses for
// a tab strip its own scroller cannot handle.
function fixTabsBar() {
    var attempts = 0;
    var style_id = 'playback-reporting-tabs-style';

    if (!document.getElementById(style_id)) {
        var style = document.createElement('style');
        style.id = style_id;
        style.textContent =
            '.headerTabs .tabs-viewmenubar{max-width:100%;}' +
            '@media all and (max-width:40em){' +
            '.headerTabs .emby-tab-button{padding:1.1em .75em;font-size:92%;}' +
            '}';
        document.head.appendChild(style);
    }

    function apply() {
        var tabs_elem = document.querySelector('.tabs-viewmenubar');
        if (!tabs_elem) {
            if (attempts++ < 20) {
                window.setTimeout(apply, 100);
            }
            return;
        }

        // Native horizontal scrolling for the strip. The overflowing content is the row of
        // tab buttons inside .emby-tabs-slider, so the scrolling element has to be that
        // slider; putting the overflow on the outer emby-tabs element does not scroll.
        // These are Jellyfin's own classes, used for exactly this purpose when its scroller
        // is unavailable, and they are also applied on narrow layouts where the header
        // strip is too cramped for the scroller's drag affordance.
        var narrow = window.matchMedia('(max-width: 60em)').matches;
        if (!tabs_elem.scroller || narrow) {
            var slider = tabs_elem.querySelector('.emby-tabs-slider') || tabs_elem;
            // No smoothScrollX: scroll-behavior:smooth stops the strip from scrolling
            // programmatically, and this strip is scrolled by Jellyfin's own scroller.
            slider.classList.add('scrollX', 'hiddenScrollX');
        }

        if (tabs_elem.parentNode) {
            tabs_elem.parentNode.classList.remove('hide');
        }

        document.body.classList.add('withSectionTabs');
    }

    apply();
}

function setPageTabs(page_name) {
    LibraryMenu.setTabs(page_name, getTabIndex(page_name), getTabs);
    fixTabsBar();
}

if (!Date.prototype.toDateInputValue) {
    Date.prototype.toDateInputValue = function () {
        var local = new Date(this);
        local.setMinutes(this.getMinutes() - this.getTimezoneOffset());
        return local.toJSON().slice(0, 10);
    };
}

Date.daysBetween = function (date1, date2) {
    var one_day = 1000 * 60 * 60 * 24;
    return Math.round((date2.getTime() - date1.getTime()) / one_day);
};

    ApiClient.getUserActivity = function (url_to_get) {
        console.log("getUserActivity Url = " + url_to_get);
        return this.ajax({
            type: "GET",
            url: url_to_get,
            dataType: "json"
        });
    };

    function seconds2time(seconds) {
        var h = Math.floor(seconds / 3600);
        seconds = seconds - h * 3600;
        var m = Math.floor(seconds / 60);
        var s = seconds - m * 60;
        var time_string = padLeft(h) + ":" + padLeft(m) + ":" + padLeft(s);
        return time_string;
    }

    function padLeft(value) {
        if (value < 10) {
            return "0" + value;
        }
        else {
            return value;
        }
    }

export default function (view, params) {

        // init code here
        view.addEventListener('viewshow', function (e) {

            setPageTabs("user_play_report");

            var parameters = {};
            var queryString = window.location.href.split('?')[1];
            if (queryString) {
                var params = queryString.split('&');
                for (var i = 0; i < params.length; i++) {
                    var parts = params[i].split('=');
                    var paramName = parts[0];
                    var paramValue = typeof (parts[1]) === 'undefined' ? true : parts[1];
                    if (!parameters[paramName]) {
                        parameters[paramName] = decodeURIComponent(paramValue);
                    }
                }
            }

            console.log("url parameters : " + JSON.stringify(parameters));

            var user_name = "";
            if (parameters["user"]) {
                user_name = parameters["user"];
            }

            var start_picker = view.querySelector('#start_date');
            var start_date = new Date();
            start_date.setDate(start_date.getDate() - 28);
            start_picker.value = start_date.toDateInputValue();
            start_picker.addEventListener("change", process_click);

            var end_picker = view.querySelector('#end_date');
            var end_date = new Date();
            end_picker.value = end_date.toDateInputValue();
            end_picker.addEventListener("change", process_click);

            var span_days_text = view.querySelector('#span_days');
            
            var user_list_selector = view.querySelector('#user_list');
            user_list_selector.addEventListener("change", process_click);

            var aggregate_data = view.querySelector('#aggregate');
            aggregate_data.addEventListener("change", process_click);

            var filter_name_input = view.querySelector('#filter_name');
            if (parameters["filter_name"]) {
                filter_name_input.value = parameters["filter_name"];
            }
            filter_name_input.addEventListener("change", process_click);

            // add user list to selector
            var url = "user_usage_stats/user_list?stamp=" + new Date().getTime();
            url = ApiClient.getUrl(url);

            ApiClient.getUserActivity(url).then(function (user_list) {
                //alert("Loaded Data: " + JSON.stringify(user_list));
                var index = 0;
                var options_html = "<option value=''>All Users</option>";
                var item_details;
                for (index = 0; index < user_list.length; ++index) {
                    item_details = user_list[index];
                    if (user_name === item_details.name) {
                        options_html += "<option value='" + item_details.id + "' selected>" + item_details.name + "</option>";
                    }
                    else {
                        options_html += "<option value='" + item_details.id + "'>" + item_details.name + "</option>";
                    }

                }
                user_list_selector.innerHTML = options_html;

                process_click();
            });

            
            function process_click() {
                
                var selected_user_id = user_list_selector.options[user_list_selector.selectedIndex].value;
                
                //if (selected_user_id === "Select User") {
                //    view.querySelector('#user_playlist_results').innerHTML = "";
                //    return;
                //}

                var filter_name = filter_name_input.value;
                var encoded_filter_name = encodeURIComponent(filter_name);

                var aggregate = aggregate_data.checked;

                var start = new Date(start_picker.value);
                var end = new Date(end_picker.value);
                if (end > new Date()) {
                    end = new Date();
                    end_picker.value = end.toDateInputValue();
                }

                var days = Date.daysBetween(start, end);
                span_days_text.innerHTML = days;

                var url_to_get = "user_usage_stats/UserPlaylist?aggregate_data=" + aggregate + "&user_id=" + selected_user_id + "&days=" + days + "&end_date=" + end_picker.value + "&filter_name=" + encoded_filter_name + "&stamp=" + new Date().getTime();
                url_to_get = ApiClient.getUrl(url_to_get);
                console.log("User Report Details Url: " + url_to_get);

                var load_status = view.querySelector('#user_playlist_status');
                load_status.innerHTML = "Loading Data...";

                ApiClient.getUserActivity(url_to_get).then(function (usage_data) {
                    load_status.innerHTML = "&nbsp;";
                    //console.log("Loaded UserPlaylist Data: " + JSON.stringify(usage_data));

                    var row_html = "";
                    var last_date_string = "";
                    var row_count = 0
                    usage_data.forEach(function (item_details, index) {

                        if (last_date_string !== item_details.date) {
                            last_date_string = item_details.date;
                            row_html += "<tr class=''>";
                            row_html += "<td colspan='4'><strong>" + last_date_string + "</strong></td>";
                            row_html += "</tr>";
                            row_count = 0
                        }

                        var row_bg_col = "#BBBBBB00";
                        if (row_count % 2 == 0) {
                            row_bg_col = "#BBBBBB1C";
                        }
                        row_count += 1
                        row_html += "<tr>";

                        row_html += "<td style='width:30px;'>&nbsp;</td>"

                        var user_image = "<span class='material-icons' style='font-size:30px;width:30px;height:30px;'>person</span>";
                        if (item_details.user_has_image) {
                            var user_img = "Users/" + item_details.user_id + "/Images/Primary?height=152&&quality=90";
                            user_img = ApiClient.getUrl(user_img);
                            user_image = "<img src='" + user_img + "' style='object-fit:cover;width:30px;height:30px;border-radius:1000px;vertical-align:top;'>";
                        }
                        row_html += "<td style='padding-left:15px;padding-right:15px;background:" + row_bg_col + ";'>";
                        row_html += "<table style='padding: 0px; border-spacing: 0px;'>";
                        row_html += "<tr>";
                        row_html += "<td style='vertical-align: middle; width:35px; padding: 0px;' align='center'>" + user_image + "</td>";
                        row_html += "<td style='vertical-align: middle; padding: 0px;'>" + item_details.user_name + "</td>";
                        row_html += "</tr>";
                        row_html += "</table>";
                        row_html += "</td>";

                        if (!aggregate) {
                            row_html += "<td style='padding-left:15px;padding-right:15px;background:" + row_bg_col + ";'>" + item_details.time + "</td>";
                        }
                        row_html += "<td style='padding-left:15px;padding-right:15px;background:" + row_bg_col + ";'>" + item_details.item_type + "</td>";

                        var name_link = '#/details?id=' + item_details.item_id + '&serverId=' + (ApiClient._serverInfo ? ApiClient._serverInfo.Id : '');
                        var item_link = "<a href='" + name_link + "' is='emby-linkbutton' class='button-link' title='View Emby item'>" + item_details.item_name + "</a>";

                        var direct_name_link = "/web/index.html#!/item?id=" + item_details.item_id + "&serverId=" + ApiClient._serverInfo.Id;
                        var new_window = "<span class='material-icons' style='cursor: pointer; font-size:24px;' onClick='window.open(\"" + direct_name_link + "\");' title='Open item in new window'>launch</span>"

                        var item_name_link = item_link + "&nbsp;&nbsp;" + new_window;
                        row_html += "<td style='padding-left:15px;padding-right:15px;background:" + row_bg_col + ";'>" + item_name_link + "</td>";

                        row_html += "<td style='padding-left:15px;padding-right:15px;background:" + row_bg_col + ";'>" + item_details.remote_address + "</td>";

                        row_html += "<td style='padding-left:15px;padding-right:15px;background:" + row_bg_col + ";'>" + seconds2time(item_details.duration) + "</td>";
                        row_html += "</tr>";
                    });

                    var table_body = view.querySelector('#user_playlist_results');
                    table_body.innerHTML = row_html;
                    
                }, function (response) { load_status.innerHTML = response.status + ":" + response.statusText; });

            }


        });

        view.addEventListener('viewhide', function (e) {

        });

        view.addEventListener('viewdestroy', function (e) {

        });
};