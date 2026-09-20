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

    ApiClient.getApiData = function (url_to_get) {
        console.log("getUserActivity Url = " + url_to_get);
        return this.ajax({
            type: "GET",
            url: url_to_get,
            dataType: "json"
        });
    };

    function PopulatePlayedInfo(view, item_info) {
        console.log(item_info);

        view.querySelector("#search_text").value = "";

        if (item_info !== null) {
            var url = "user_usage_stats/get_item_stats?id=" + item_info.Id;
            url += "&stamp=" + new Date().getTime();
            url = ApiClient.getUrl(url);
            ApiClient.getApiData(url).then(function (user_data) {
                console.log("Loaded Data: " + JSON.stringify(user_data));

                // populate the item info
                var played_item_info = view.querySelector('#played_item_info');
                var item_display_info = "<span style='font-weight: bold; font-size:120%;'>" + item_info.Name + "</span><br>";
                item_display_info += item_info.ItemType + "<br>";
                
                //item_display_info += "Item Id : " + item_info.Id + "<br>";
                //item_display_info += "Series : " + item_info.Series + "<br>";

                played_item_info.innerHTML = item_display_info;

                // clean and populate the user played info
                var played_users_details = view.querySelector('#played_users_details');
                while (played_users_details.firstChild) {
                    played_users_details.removeChild(played_users_details.firstChild);
                }

                for (const user_info of user_data) {
                    var tr = document.createElement("tr");
                    var td = document.createElement("td");

                    var played = user_info.played === "True"
                    if (user_info.child_watched && user_info.child_total) {
                        if (user_info.child_watched === user_info.child_total) {
                            played = true;
                        }
                    }

                    if (played) {
                        var i = document.createElement("i");
                        i.className = "material-icons";
                        i.style.fontSize = "25px";
                        i.style.color = "#00FF00";
                        i.appendChild(document.createTextNode("check_circle_outline"));
                        td.appendChild(i);
                        //td.style.backgroundColor = "#00FF00";
                    }
                    else {
                        var i = document.createElement("i");
                        i.className = "material-icons";
                        i.style.fontSize = "25px";
                        i.style.color = "grey";
                        i.appendChild(document.createTextNode("highlight_off"));
                        td.appendChild(i);
                        //td.style.backgroundColor = "#FF0000";
                    }
                    tr.appendChild(td);

                    td = document.createElement("td");
                    var user_info_txt = user_info.name;
                    if (user_info.child_stats) {
                        user_info_txt += " (" + user_info.child_stats + ")";
                    } 
                    td.appendChild(document.createTextNode(user_info_txt));
                    tr.appendChild(td);

                    played_users_details.appendChild(tr);
                }

            });
        }

    }

    function PopulateSelectedPath(view, item_info) {

        var path_string = view.querySelector("#path_string");
        while (path_string.firstChild) {
            path_string.removeChild(path_string.firstChild);
        }
        
        if (item_info === null) {
            path_string.appendChild(document.createTextNode("\\"));
            return;
        }

        var url = "user_usage_stats/get_item_path";
        url += "?id=" + item_info.Id;
        url += "&stamp=" + new Date().getTime();
        url = ApiClient.getUrl(url);

        ApiClient.getApiData(url).then(function (item_path_data) {
            console.log("Loaded Path Data: " + JSON.stringify(item_path_data));

            //var path_link_data = "";
            for (const path_info of item_path_data) {

                var span = document.createElement("span");
                span.appendChild(document.createTextNode(path_info.Name));
                span.style.cursor = "pointer"; 

                span.addEventListener("click", function () {
                    var item_data = { Name: path_info.Name, Id: path_info.Id };
                    PopulateSelector(view, item_data, "");
                    PopulatePlayedInfo(view, item_data);
                    PopulateSelectedPath(view, item_data);
                });

                path_string.appendChild(document.createTextNode("\\"));
                path_string.appendChild(span);

            }
        });

    }

    function PopulateSelector(view, item_info, search_filter) {

        var parent_id = 0;
        var url = "user_usage_stats/get_items?";

        var is_seaerch = false;

        if (search_filter !== null && search_filter.length > 0) {
            url += "parent=0";
            url += "&filter=" + search_filter;
            is_seaerch = true;
        }
        else if (item_info !== null) {
            parent_id = item_info.Id;
            url += "parent=" + parent_id;
        }
        else {
            url += "parent=0";
        }

        url += "&stamp=" + new Date().getTime();
        url = ApiClient.getUrl(url);

        ApiClient.getApiData(url).then(function (item_data) {
            //alert("Loaded Data: " + JSON.stringify(item_data));

            var item_list = view.querySelector('#item_list');

            // clear current list
            if (is_seaerch || (item_info !== null && item_data.length > 0)) {
                while (item_list.firstChild) {
                    item_list.removeChild(item_list.firstChild);
                }
            }

            // add items
            for (const item_details of item_data) {
                var tr = document.createElement("tr");
                var td = document.createElement("td");
                td.appendChild(document.createTextNode(item_details.Name));
                td.addEventListener("click", function () {
                    PopulateSelectedPath(view, item_details);
                    PopulatePlayedInfo(view, item_details);
                    PopulateSelector(view, item_details, "");
                });
                td.style.cursor = "pointer"; 
                tr.appendChild(td);
                item_list.appendChild(tr);
            }

        });
    }

    var qr_timeout = null;
    function SearchChanged(view, search_box) {

        if (qr_timeout != null) {
            clearTimeout(qr_timeout);
        }

        qr_timeout = setTimeout(function () {

            var search_text = search_box.value;
            search_text = search_text.trim();
            console.log("search: " + search_text);
            var item_info = { Id: "0" };
            PopulateSelector(view, item_info, search_text);

        }, 500);

    }

export default function (view, params) {

        // init code here
        view.addEventListener('viewshow', function (e) {

            setPageTabs("played");

            var style = document.createElement('style');
            style.innerHTML = '#item_list tr:hover { background-color: grey; }';
            var ref = document.querySelector('script');
            ref.parentNode.insertBefore(style, ref);

            var search_box = view.querySelector("#search_text");
            search_box.addEventListener("input", function () { SearchChanged(view, search_box); });

            PopulateSelector(view, null, "");

        });

        view.addEventListener('viewhide', function (e) {

        });

        view.addEventListener('viewdestroy', function (e) {

        });
};