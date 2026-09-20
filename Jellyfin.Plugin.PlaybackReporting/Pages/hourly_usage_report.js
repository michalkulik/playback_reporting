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

    var daily_bar_chart = null;
    var hourly_bar_chart = null;
    var weekly_bar_chart = null;
    var filter_names = [];
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

    function draw_graph(view, local_chart, usage_data) {

        var days_of_week = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        var all_colours = [];
        while (all_colours.length < 3 && color_list.length !== 0) {
            all_colours = all_colours.concat(color_list);
        }

        //console.log(usage_data);
        var chart_labels = [];
        var chart_data = [];
        var aggregated_hours = {};
        var aggregated_days = {};
        for (var key in usage_data) {
            //console.log(key + " " + usage_data[key]);
            var day_index = key.substring(0, 1);
            var day_name = days_of_week[day_index];
            var day_hour = key.substring(2);
            //chart_labels.push(day_name + " " + day_hour + ":00");
            chart_labels.push(day_name + " " + day_hour);
            chart_data.push(usage_data[key]);//precisionRound(usage_data[key] / 60, 2));
            var current_hour_value = 0;
            if (aggregated_hours[day_hour]) {
                current_hour_value = aggregated_hours[day_hour];
            }
            aggregated_hours[day_hour] = current_hour_value + usage_data[key];
            var current_day_value = 0;
            if (aggregated_days[day_index]) {
                current_day_value = aggregated_days[day_index];
            }
            aggregated_days[day_index] = current_day_value + usage_data[key];
        }
        //chart_labels.push("00");

        //console.log(JSON.stringify(aggregated_hours));
        //console.log(JSON.stringify(aggregated_days));

        //
        // daily bar chart data
        //
        var daily_chart_label_data = [];
        var daily_chart_point_data = [];
        var daily_days_labels = Object.keys(aggregated_days);
        daily_days_labels.sort();
        for (var daily_key_index = 0; daily_key_index < daily_days_labels.length; daily_key_index++) {
            var daily_key = daily_days_labels[daily_key_index];
            daily_chart_label_data.push(days_of_week[daily_key]);
            daily_chart_point_data.push(aggregated_days[daily_key]);
        }

        var daily_chart_data = {
            labels: daily_chart_label_data,
            datasets: [{
                label: 'Time',
                type: "bar",
                backgroundColor: all_colours[0],//'#d98880',
                data: daily_chart_point_data
            }]
        };

        //
        // hourly chart data
        //
        var hourly_chart_label_data = [];
        var hourly_chart_point_data = [];
        var hourly_days_labels = Object.keys(aggregated_hours);
        hourly_days_labels.sort();
        for (var hourly_key_index = 0; hourly_key_index < hourly_days_labels.length; hourly_key_index++) {
            var hourly_key = hourly_days_labels[hourly_key_index];
            hourly_chart_label_data.push(hourly_key);
            hourly_chart_point_data.push(aggregated_hours[hourly_key]);
        }

        var hourly_chart_data = {
            labels: hourly_chart_label_data,
            datasets: [{
                label: 'Time',
                type: "bar",
                backgroundColor: all_colours[1],//'#d98880',
                data: hourly_chart_point_data
            }]
        };

        //
        // weekly bar chart data
        //
        var weekly_chart_data = {
            labels: chart_labels, //['Mon 00', 'Mon 01', 'Mon 02', 'Mon 03', 'Mon 04', 'Mon 05', 'Mon 06'],
            datasets: [{
                label: 'Time',
                type: "bar",
                backgroundColor: all_colours[2],//'#d98880',
                data: chart_data // [10,20,30,40,50,60,70]
            }/*,
            {
                label: "Minutes",
                type: "line",
                lineTension: 0,
                borderColor: "#8e5ea2",
                data: chart_data, // [10,20,30,40,50,60,70],
                fill: false
            }*/]
        };

        function y_axis_labels(value, index, values) {
            if (Math.floor(value / 10) === (value / 10)) {
                return seconds2time(value);
            }
        }

        function tooltip_labels(tooltipItem) {
            var data_index = tooltipItem.dataIndex;
            var label = tooltipItem.dataset.label || '';

            if (label) {
                label += ": " + seconds2time(tooltipItem.dataset.data[data_index]);
            }

            return label;
        }

        //
        // daily chart
        //
        var daily_chart_canvas = view.querySelector('#daily_usage_chart_canvas');
        var ctx_daily = daily_chart_canvas.getContext('2d');

        if (daily_bar_chart) {
            console.log("destroy() existing chart: daily_bar_chart");
            daily_bar_chart.destroy();
        }

        daily_bar_chart = new Chart(ctx_daily, {
            type: 'bar',
            data: daily_chart_data,
            options: {
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: false,
                        text: ""
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: tooltip_labels
                        }
                    }
                },
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: false,
                        grid: {
                            color: '#99999944'
                        }
                    },
                    y: {
                        stacked: false,
                        ticks: {
                            autoSkip: true,
                            beginAtZero: true,
                            callback: y_axis_labels
                        },
                        grid: {
                            color: '#99999944'
                        }
                    }
                }
            }
        });

        //
        // hourly chart
        //
        var hourly_chart_canvas = view.querySelector('#hourly_usage_chart_canvas');
        var ctx_hourly = hourly_chart_canvas.getContext('2d');

        if (hourly_bar_chart) {
            console.log("destroy() existing chart: hourly_bar_chart");
            hourly_bar_chart.destroy();
        }

        hourly_bar_chart = new Chart(ctx_hourly, {
            type: 'bar',
            data: hourly_chart_data,
            options: {
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: false,
                        text: ""
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: tooltip_labels
                        }
                    }
                },
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: false,
                        grid: {
                            color: '#99999944'
                        }
                    },
                    y: {
                        stacked: false,
                        ticks: {
                            autoSkip: true,
                            beginAtZero: true,
                            callback: y_axis_labels
                        },
                        grid: {
                            color: '#99999944'
                        }
                    }
                }
            }
        });

        //
        // weekly chart
        //
        var chart_canvas = view.querySelector('#weekly_usage_chart_canvas');
        var ctx_weekly = chart_canvas.getContext('2d');

        if (weekly_bar_chart) {
            console.log("destroy() existing chart: weekly_bar_chart");
            weekly_bar_chart.destroy();
        }

        weekly_bar_chart = new Chart(ctx_weekly, {
            type: 'bar',
            data: weekly_chart_data,
            options: {
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: false,
                        text: ""
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: tooltip_labels
                        }
                    }
                },
                responsive: true,
                maintainAspectRatio: false,
                scaleShowValues: true,
                scales: {
                    x: {
                        stacked: false,
                        ticks: {
                            //autoSkip: false
                        },
                        grid: {
                            color: '#99999944'
                        }
                    },
                    y: {
                        stacked: false,
                        ticks: {
                            autoSkip: true,
                            beginAtZero: true,
                            callback: y_axis_labels
                        },
                        grid: {
                            color: '#99999944'
                        }
                    }
                }
            }
        });

        console.log("Charts Done");
    }

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

            setPageTabs("hourly_usage_report", view);

            loadChart(function () {

                var user_name = "";
                var user_name_index = window.location.href.indexOf("user=");
                if (user_name_index > -1) {
                    user_name = window.location.href.substring(user_name_index + 5);
                }

                var filter_url = ApiClient.getUrl("user_usage_stats/type_filter_list");
                console.log("loading types form : " + filter_url);

                var load_status = view.querySelector('#usage_duration_report_status');
                load_status.innerHTML = "Loading Data...";

                ApiClient.getUserActivity(filter_url).then(function (filter_data) {
                    load_status.innerHTML = "&nbsp;";
                    filter_names = filter_data;

                    // build filter list
                    var filter_items = "";
                    for (var x1 = 0; x1 < filter_names.length; x1++) {
                        var filter_name_01 = filter_names[x1];
                        filter_items += "<input type='checkbox' id='media_type_filter_" + filter_name_01 + "' data_fileter_name='" + filter_name_01 + "' checked> " + filter_name_01 + " ";
                    }

                    var filter_check_list = view.querySelector('#filter_check_list');
                    filter_check_list.innerHTML = filter_items;

                    for (var x2 = 0; x2 < filter_names.length; x2++) {
                        var filter_name_02 = filter_names[x2];
                        view.querySelector('#media_type_filter_' + filter_name_02).addEventListener("click", process_click);
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

                    // add user list to selector
                    var user_url = "user_usage_stats/user_list?stamp=" + new Date().getTime();
                    user_url = ApiClient.getUrl(user_url);

                    ApiClient.getUserActivity(user_url).then(function (user_list) {
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
                        ApiClient.getNamedConfiguration('playback_reporting').then(function (config) {
                            if (config.ColourPalette.length === 0) {
                                color_list = getDefautColours();
                            }
                            else {
                                color_list = config.ColourPalette;
                            }
                            process_click();
                        });
                    });

                    function process_click() {
                        var filter = [];
                        for (var x3 = 0; x3 < filter_names.length; x3++) {
                            var filter_name = filter_names[x3];
                            var filter_checked = view.querySelector('#media_type_filter_' + filter_name).checked;
                            if (filter_checked) {
                                filter.push(filter_name);
                            }
                        }

                        var start = new Date(start_picker.value);
                        var end = new Date(end_picker.value);
                        if (end > new Date()) {
                            end = new Date();
                            end_picker.value = end.toDateInputValue();
                        }

                        var days = Date.daysBetween(start, end);
                        span_days_text.innerHTML = days;
                        var selected_user_id = user_list_selector.options[user_list_selector.selectedIndex].value;

                        var url = "user_usage_stats/HourlyReport?user_id=" + selected_user_id + "&days=" + days + "&end_date=" + end_picker.value + "&filter=" + filter.join(",") + "&stamp=" + new Date().getTime();
                        url = ApiClient.getUrl(url);

                        load_status.innerHTML = "Loading Data...";

                        ApiClient.getUserActivity(url).then(function (usage_data) {
                            load_status.innerHTML = "&nbsp;";
                            //alert("Loaded Data: " + JSON.stringify(usage_data));
                            draw_graph(view, window.Chart, usage_data);
                        }, function (response) { load_status.innerHTML = response.status + ":" + response.statusText; });
                    }
                }, function (response) { load_status.innerHTML = response.status + ":" + response.statusText; });
            });

        });

        view.addEventListener('viewhide', function (e) {

        });

        view.addEventListener('viewdestroy', function (e) {

        });
};