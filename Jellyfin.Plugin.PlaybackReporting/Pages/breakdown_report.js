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

// Two Jellyfin 12 layout problems are fixed here, both of which only show up on narrow
// screens (phones and the mobile app):
//   1. The report tables are wider than the screen. Jellyfin's plugin page wrapper uses
//      overflow:hidden and cannot scroll, so the last columns were clipped away with no
//      way to reach them.
//   2. The section tab strip in the shared header is scrolled by a scroller whose
//      element is only upgraded by the legacy CustomElements polyfill, which the mobile
//      wrapper does not always provide, leaving the strip clipped and unscrollable.
function fixPageLayout(view) {
    var attempts = 0;
    var style_id = 'playback-reporting-style';

    if (!document.getElementById(style_id)) {
        var style = document.createElement('style');
        style.id = style_id;
        style.textContent =
            // Report tables get their own horizontal scroller (see makeTablesScrollable).
            '.pr-table-scroll{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;}' +
            '.headerTabs .tabs-viewmenubar{max-width:100%;}' +
            '@media all and (max-width:40em){' +
            '.headerTabs .emby-tab-button{padding:1.1em .75em;font-size:92%;}' +
            '}';
        document.head.appendChild(style);
    }

    // The report tables are wider than a phone screen, and Jellyfin's plugin page wrapper
    // (type-interior > div[data-role=content]) is overflow:hidden and cannot scroll, so the
    // last columns were clipped away with no way to reach them. Give every table its own
    // horizontal scroller. The wrapper keeps height:auto, so nothing is clipped vertically
    // and the page keeps scrolling exactly as before (setting the overflow on
    // .content-primary instead turned it into a nested vertical scroller).
    function makeTablesScrollable() {
        var scope = view || document;
        var tables = scope.querySelectorAll('.content-primary table');
        for (var i = 0; i < tables.length; i++) {
            var table = tables[i];
            var parent = table.parentNode;
            if (!parent || (parent.classList && parent.classList.contains('pr-table-scroll'))) {
                continue;
            }
            var wrapper = document.createElement('div');
            wrapper.className = 'pr-table-scroll';
            parent.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        }
    }

    makeTablesScrollable();

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

function setPageTabs(page_name, view) {
    LibraryMenu.setTabs(page_name, getTabIndex(page_name), getTabs);
    fixPageLayout(view);
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

// Jellyfin 12 has no RequireJS, so Chart.js is loaded with a plain script tag.
function loadChart(callback) {
    if (window.Chart) {
        callback();
        return;
    }

    var existing = document.querySelector('script[data-playback-reporting-chart]');
    if (existing) {
        existing.addEventListener('load', callback);
        return;
    }

    var script = document.createElement('script');
    script.src = Dashboard.getConfigurationResourceUrl('chart.min.js');
    script.setAttribute('data-playback-reporting-chart', '1');
    script.addEventListener('load', callback);
    document.head.appendChild(script);
}

    var chart_instance_map = {};
    var color_list = [];

    ApiClient.getUserActivity = function (url_to_get) {
        console.log("getUserActivity Url = " + url_to_get);
        return this.ajax({
            type: "GET",
            url: url_to_get,
            dataType: "json"
        });
    };

    function precisionRound(number, precision) {
        var factor = Math.pow(10, precision);
        return Math.round(number * factor) / factor;
    }

    function generate_chart_legend_count(chart, group_type) {
        var legendHtml = [];
        legendHtml.push('<table style="width:100%">');
        var item = chart.data.datasets[0];
        for (var i = 0; i < item.data.length; i++) {
            legendHtml.push('<tr>');
            legendHtml.push('<td style="width: 20px"><div style="width: 20px; background-color:' + item.backgroundColor[i] + '">&nbsp;</div></td>');
            var label_data = chart.data.labels[i];
            if (group_type === "Movies" || group_type === "TvShows") {
                var filter_name = chart.data.labels[i];
                if (group_type === "TvShows") {
                    filter_name += " - *";
                }
                var encoded_uri = encodeURIComponent(filter_name);
                encoded_uri = encoded_uri.replace("'", "%27");
                encoded_uri = encoded_uri.replace("\"", "%22");
                console.log(filter_name)
                console.log(encoded_uri)
                var summary_url = getConfigurationPageUrl('user_play_report') + "&filter_name=" + encoded_uri;
                label_data = "<a href='" + summary_url + "' is='emby-linkbutton' style='padding: 0px;font-weight:normal;' title='" + chart.data.labels[i] + "'>" + chart.data.labels[i] + "</a>";
            }
            legendHtml.push('<td style="max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + label_data + '</td>');
            legendHtml.push('<td style="width: 10px; text-align: right; white-space: nowrap;">' + item.data[i] + '</td>');
            legendHtml.push('</tr>');
        }
        legendHtml.push('</table>');
        return legendHtml.join("");
    }

    function generate_chart_legend_time(chart, group_type) {
        var legendHtml = [];
        legendHtml.push('<table style="width:100%">');
        var item = chart.data.datasets[0];
        for (var i = 0; i < item.data.length; i++) {
            legendHtml.push('<tr>');
            legendHtml.push('<td style="width: 20px"><div style="width: 20px; background-color:' + item.backgroundColor[i] + '">&nbsp;</div></td>');
            var label_data = chart.data.labels[i];
            if (group_type === "Movies" || group_type === "TvShows") {
                var filter_name = chart.data.labels[i];
                if (group_type === "TvShows") {
                    filter_name += " - *";
                }
                var encoded_uri = encodeURIComponent(filter_name);
                encoded_uri = encoded_uri.replace("'", "%27");
                encoded_uri = encoded_uri.replace("\"", "%22");

                var lable_title_value = chart.data.labels[i];
                lable_title_value = lable_title_value.replace("'", "%27");
                lable_title_value = lable_title_value.replace("\"", "%22");

                var summary_url = getConfigurationPageUrl('user_play_report') + "&filter_name=" + encoded_uri;
                label_data = "<a href='" + summary_url + "' is='emby-linkbutton' style='padding: 0px;font-weight:normal;' title='" + lable_title_value + "'>" + chart.data.labels[i] + "</a>";
            }
            legendHtml.push('<td style="max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + label_data + '</td>');
            legendHtml.push('<td style="width: 10px; text-align: right; white-space: nowrap;">' + seconds2time(item.data[i]) + '</td>');
            legendHtml.push('</tr>');

        }
        legendHtml.push('</table>');
        return legendHtml.join("");
    }

    function draw_chart_user_count(view, local_chart, data, group_type, max_item_count, add_other) {

        var chart_data_labels_count = [];
        var chart_data_values_count = [];

        var chart_data_labels_time = [];
        var chart_data_values_time = [];

        data.sort(function (a, b) {
            return a["count"] > b["count"] ? -1 : a["count"] === b["count"] ? 0 : 1;
        });

        var count = 0;
        var max_items = max_item_count;
        var index;
        var other_count = 0;
        for (index in data) {
            if (count++ < max_items) {
                chart_data_labels_count.push(data[index]["label"]);
                chart_data_values_count.push(data[index]["count"]);
            }
            else {
                other_count += data[index]["count"];
            }
        }
        if (other_count > 0 && add_other) {
            chart_data_labels_count.push("Other");
            chart_data_values_count.push(other_count);
        }

        data.sort(function (a, b) {
            return a["time"] > b["time"] ? -1 : a["time"] === b["time"] ? 0 : 1;
        });

        count = 0;
        other_count = 0;
        for (index in data) {
            if (count++ < max_items) {
                chart_data_labels_time.push(data[index]["label"]);
                chart_data_values_time.push(data[index]["time"]);
            }
            else {
                other_count += data[index]["time"];
            }
        }
        if (other_count > 0 && add_other) {
            chart_data_labels_time.push("Other");
            chart_data_values_time.push(other_count);
        }

        var all_colours = [];
        var colour_max = max_items;
        if (max_items) {
            colour_max += 1;
        }
        while (all_colours.length < colour_max && color_list.length !== 0) {
            all_colours = all_colours.concat(color_list);
        }

        //console.log(chart_data_labels_count);
        //console.log(chart_data_values_count);
        //console.log(chart_data_labels_time);
        //console.log(chart_data_values_time);

        var chart_data_user_count = {
            labels: chart_data_labels_count,
            datasets: [{
                label: "Breakdown",
                backgroundColor: all_colours,
                data: chart_data_values_count
            }]
        };

        var chart_data_user_time = {
            labels: chart_data_labels_time,
            datasets: [{
                label: "Breakdown",
                backgroundColor: all_colours,
                data: chart_data_values_time
            }]
        };

        function tooltip_labels(tooltipItem) {

            var data_index = tooltipItem.dataIndex;
            var label = tooltipItem.label || '';

            if (label) {
                label += ": " + seconds2time(tooltipItem.dataset.data[data_index]);
            }

            return label;
        }

        var chart_canvas_count = view.querySelector('#' + group_type + '_breakdown_count_chart_canvas');
        var cxt_count = chart_canvas_count.getContext('2d');
        if (chart_instance_map[group_type + "_count"]) {
            console.log("destroy() existing chart");
            chart_instance_map[group_type + "_count"].destroy();
        }
        chart_instance_map[group_type + "_count"] = new Chart(cxt_count, {
            type: 'pie',
            data: chart_data_user_count,
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: group_type + " (Plays)"
                    },
                    legend: {
                        display: false
                    }
                }
            }
        });

        var chart_legend_count = view.querySelector('#' + group_type + '_breakdown_count_chart_legend');
        if (chart_legend_count !== null) {
            var legend_data_count = generate_chart_legend_count(chart_instance_map[group_type + "_count"], group_type);
            chart_legend_count.innerHTML = legend_data_count;
        }

        if (chart_instance_map[group_type + "_time"]) {
            console.log("destroy() existing chart");
            chart_instance_map[group_type + "_time"].destroy();
        }

        var chart_canvas_time = view.querySelector('#' + group_type + '_breakdown_time_chart_canvas');
        var cxt_time = chart_canvas_time.getContext('2d');
        chart_instance_map[group_type + "_time"] = new Chart(cxt_time, {
            type: 'pie',
            data: chart_data_user_time,
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: group_type + " (Time)"
                    },
                    tooltip: {
                        callbacks: {
                            label: tooltip_labels
                        }
                    },
                    legend: {
                        display: false
                    }
                }
            }
        });

        var chart_legend_time = view.querySelector('#' + group_type + '_breakdown_time_chart_legend');
        if (chart_legend_time !== null) {
            var legend_data_time = generate_chart_legend_time(chart_instance_map[group_type + "_time"], group_type);
            chart_legend_time.innerHTML = legend_data_time;
        }

        console.log("Charts Done");
    }

    function seconds2time(seconds) {
        var d = Math.floor(seconds / 86400);
        seconds = seconds - d * 86400;
        var h = Math.floor(seconds / 3600);
        seconds = seconds - h * 3600;
        var m = Math.floor(seconds / 60);
        var s = seconds - m * 60;
        var time_string = "";
        if (d > 0) {
            time_string += d + ".";
        }
        time_string += padLeft(h) + ":" + padLeft(m) + ":" + padLeft(s);
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

            setPageTabs("breakdown_report", view);

            loadChart(function () {

                var user_name = "";
                var user_name_index = window.location.href.indexOf("user=");
                if (user_name_index > -1) {
                    user_name = window.location.href.substring(user_name_index + 5);
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

                var num_items = view.querySelector('#num_items');
                num_items.addEventListener("change", process_click);

                var add_other_items = view.querySelector('#add_other_items');
                add_other_items.addEventListener("change", process_click);

                var user_list_selector = view.querySelector('#user_list');
                user_list_selector.addEventListener("change", process_click);

                // add user list to selector
                var url = "user_usage_stats/user_list?stamp=" + new Date().getTime();
                url = ApiClient.getUrl(url);

                ApiClient.getUserActivity(url).then(function (user_list) {

                    ApiClient.getNamedConfiguration('playback_reporting').then(function (config) {
                        if (config.ColourPalette.length === 0) {
                            color_list = getDefautColours();
                        }
                        else {
                            color_list = config.ColourPalette;
                        }

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
                });

                function process_click() {
                    var start = new Date(start_picker.value);
                    var end = new Date(end_picker.value);
                    if (end > new Date()) {
                        end = new Date();
                        end_picker.value = end.toDateInputValue();
                    }

                    var days = Date.daysBetween(start, end);
                    span_days_text.innerHTML = days;

                    var item_count = parseInt(num_items.value);
                    var add_other_line = add_other_items.checked;
                    var url = "";

                    var load_status = view.querySelector('#breakdown_report_status');
                    load_status.innerHTML = "Loading Data...";
                    var load_count = 0;

                    var selected_user_id = user_list_selector.options[user_list_selector.selectedIndex].value;

                    // build user chart
                    url = "user_usage_stats/UserId/BreakdownReport?user_id=" + selected_user_id + "&days=" + days + "&end_date=" + end_picker.value + "&stamp=" + new Date().getTime();
                    url = ApiClient.getUrl(url);
                    ApiClient.getUserActivity(url).then(function (data) {
                        if (++load_count === 7) { load_status.innerHTML = "&nbsp;"; }
                        //alert("Loaded Data: " + JSON.stringify(usage_data));
                        draw_chart_user_count(view, window.Chart, data, "User", item_count, add_other_line);
                    }, function (response) { load_count = -100; load_status.innerHTML = response.status + ":" + response.statusText; });
                    
                    // build ItemType chart
                    url = "user_usage_stats/ItemType/BreakdownReport?user_id=" + selected_user_id + "&days=" + days + "&end_date=" + end_picker.value + "&stamp=" + new Date().getTime();
                    url = ApiClient.getUrl(url);
                    ApiClient.getUserActivity(url).then(function (data) {
                        if (++load_count === 7) { load_status.innerHTML = "&nbsp;"; }
                        //alert("Loaded Data: " + JSON.stringify(usage_data));
                        draw_chart_user_count(view, window.Chart, data, "ItemType", item_count, add_other_line);
                    }, function (response) { load_count = -100; load_status.innerHTML = response.status + ":" + response.statusText; });

                    // build PlaybackMethod chart
                    url = "user_usage_stats/PlaybackMethod/BreakdownReport?user_id=" + selected_user_id + "&days=" + days + "&end_date=" + end_picker.value + "&stamp=" + new Date().getTime();
                    url = ApiClient.getUrl(url);
                    ApiClient.getUserActivity(url).then(function (data) {
                        if (++load_count === 7) { load_status.innerHTML = "&nbsp;"; }
                        //alert("Loaded Data: " + JSON.stringify(usage_data));
                        draw_chart_user_count(view, window.Chart, data, "PlayMethod", item_count, add_other_line);
                    }, function (response) { load_count = -100; load_status.innerHTML = response.status + ":" + response.statusText; });

                    // build ClientName chart
                    url = "user_usage_stats/ClientName/BreakdownReport?user_id=" + selected_user_id + "&days=" + days + "&end_date=" + end_picker.value + "&stamp=" + new Date().getTime();
                    url = ApiClient.getUrl(url);
                    ApiClient.getUserActivity(url).then(function (data) {
                        if (++load_count === 7) { load_status.innerHTML = "&nbsp;"; }
                        //alert("Loaded Data: " + JSON.stringify(usage_data));
                        draw_chart_user_count(view, window.Chart, data, "ClientName", item_count, add_other_line);
                    }, function (response) { load_count = -100; load_status.innerHTML = response.status + ":" + response.statusText; });

                    // build DeviceName chart
                    url = "user_usage_stats/DeviceName/BreakdownReport?user_id=" + selected_user_id + "&days=" + days + "&end_date=" + end_picker.value + "&stamp=" + new Date().getTime();
                    url = ApiClient.getUrl(url);
                    ApiClient.getUserActivity(url).then(function (data) {
                        if (++load_count === 7) { load_status.innerHTML = "&nbsp;"; }
                        //alert("Loaded Data: " + JSON.stringify(usage_data));
                        draw_chart_user_count(view, window.Chart, data, "DeviceName", item_count, add_other_line);
                    }, function (response) { load_count = -100; load_status.innerHTML = response.status + ":" + response.statusText; });

                    // build TvShows chart
                    url = "user_usage_stats/TvShowsReport?user_id=" + selected_user_id + "&days=" + days + "&end_date=" + end_picker.value + "&stamp=" + new Date().getTime();
                    url = ApiClient.getUrl(url);
                    ApiClient.getUserActivity(url).then(function (data) {
                        if (++load_count === 7) { load_status.innerHTML = "&nbsp;"; }
                        //alert("Loaded Data: " + JSON.stringify(usage_data));
                        draw_chart_user_count(view, window.Chart, data, "TvShows", item_count, add_other_line);
                    }, function (response) { load_count = -100; load_status.innerHTML = response.status + ":" + response.statusText; });

                    // build Movies chart
                    url = "user_usage_stats/MoviesReport?user_id=" + selected_user_id + "&days=" + days + "&end_date=" + end_picker.value + "&stamp=" + new Date().getTime();
                    url = ApiClient.getUrl(url);
                    ApiClient.getUserActivity(url).then(function (data) {
                        if (++load_count === 7) { load_status.innerHTML = "&nbsp;"; }
                        //alert("Loaded Data: " + JSON.stringify(usage_data));
                        draw_chart_user_count(view, window.Chart, data, "Movies", item_count, add_other_line);
                    }, function (response) { load_count = -100; load_status.innerHTML = response.status + ":" + response.statusText; });
                }
            });
        });

        view.addEventListener('viewhide', function (e) {

        });

        view.addEventListener('viewdestroy', function (e) {

        });
};