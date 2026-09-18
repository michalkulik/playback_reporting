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

export default function (view, params) {

        // init code here
        view.addEventListener('viewshow', function (e) {

            LibraryMenu.setTabs("user_report", getTabIndex("user_report"), getTabs);

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

            process_click();

            function process_click() {
                var start = new Date(start_picker.value);
                var end = new Date(end_picker.value);
                if (end > new Date()) {
                    end = new Date();
                    end_picker.value = end.toDateInputValue();
                }

                var days = Date.daysBetween(start, end);
                span_days_text.innerHTML = days;

                var url = "user_usage_stats/user_activity?days=" + days + "&end_date=" + end_picker.value + "&stamp=" + new Date().getTime();
                url = ApiClient.getUrl(url);

                var load_status = view.querySelector('#user_usage_report_status');
                load_status.innerHTML = "Loading Data...";

                ApiClient.getUserActivity(url).then(function (user_data) {
                    load_status.innerHTML = "&nbsp;";
                    console.log("usage_data: " + JSON.stringify(user_data));

                    var table_body = view.querySelector('#user_report_results');
                    var row_html = "";

                    for (var index = 0; index < user_data.length; ++index) {
                        var user_info = user_data[index];

                        var row_bg_col = "#BBBBBB00";
                        if (index % 2 == 0) {
                            row_bg_col = "#BBBBBB1C";
                        }

                        row_html += "<tr style='background:" + row_bg_col + ";'>";

                        var summary_url = getConfigurationPageUrl('user_play_report') + "&user=" + encodeURI(user_info.user_name);
                        var summary_link = "<a is='emby-linkbutton' style='padding: 1px;' href='" + summary_url + "' title='Summary'>" +
                            "<i class='md-icon largeIcon'>view_list</i></a>";

                        var breakdown_url = getConfigurationPageUrl('breakdown_report') + "&user=" + encodeURI(user_info.user_name);
                        var breakdown_link = "<a is='emby-linkbutton' style='padding: 1px;' href='" + breakdown_url + "' title='Breakdown'>" +
                            "<i class='md-icon largeIcon'>pie_chart</i></a>";
                        
                        var time_url = getConfigurationPageUrl('hourly_usage_report') + "&user=" + encodeURI(user_info.user_name);
                        var time_link = "<a is='emby-linkbutton' style='padding: 1px;' href='" + time_url + "' title='Time'>" +
                            "<i class='md-icon largeIcon'>access_time</i></a>";

                        row_html += "<td valign='middle' align='left' width='10' nowrap>" + summary_link + breakdown_link + time_link + "</td>";
                        
                        
                        var user_image = "<i class='md-icon' style='font-size:30px;'></i>";                   
                        if (user_info.has_image) {
                            var user_img = "Users/" + user_info.user_id + "/Images/Primary?height=152&&quality=90";
                            user_img = ApiClient.getUrl(user_img);
                            user_image = "<img src='" + user_img + "' style='object-fit:cover;width:30px;height:30px;border-radius:1000px;vertical-align:top;'>";
                        }                      
                        row_html += "<td>";
                        row_html += "<table>";
                        row_html += "<tr>";
                        row_html += "<td style='vertical-align: middle; width:35px;' align='center'>" + user_image + "</td>";
                        row_html += "<td style='vertical-align: middle;'>" + user_info.user_name + "</td>";
                        row_html += "</tr>";
                        row_html += "</table>";
                        row_html += "</td>";

                        row_html += "<td style='font-size:80%;'>" + user_info.last_seen + "</td>";


                        var name_link = '#/details?id=' + user_info.item_id + '&serverId=' + (ApiClient._serverInfo ? ApiClient._serverInfo.id : '');
                        var item_link = "<a href='" + name_link + "' is='emby-linkbutton' class='button-link' title='View Emby item'>" + user_info.item_name + "</a>";

                        var direct_name_link = "/web/index.html#!/item?id=" + user_info.item_id + "&serverId=" + ApiClient._serverInfo.Id;
                        var new_window = "<i class='md-icon' style='cursor: pointer; font-size:100%;' onClick='window.open(\"" + direct_name_link + "\");' title='Open Emby item in new window'>launch</i>"

                        var item_name_link = item_link + "&nbsp;&nbsp;" + new_window;

                        row_html += "<td>" + item_name_link + "</td>";


                        row_html += "<td>" + user_info.client_name + "</td>";
                        row_html += "<td>" + user_info.total_count + "</td>";
                        row_html += "<td style='font-size:80%;'>" + user_info.total_play_time + "</td>";

                        row_html += "</tr>";
                    }

                    table_body.innerHTML = row_html;

                }, function (response) { load_status.innerHTML = response.status + ":" + response.statusText; });
            }
        });

        view.addEventListener('viewhide', function (e) {

        });

        view.addEventListener('viewdestroy', function (e) {

        });
};