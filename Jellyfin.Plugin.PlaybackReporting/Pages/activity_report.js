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

    ApiClient.getActivity = function (url_to_get) {
        console.log("getActivity Url = " + url_to_get);
        return this.ajax({
            type: "GET",
            url: url_to_get,
            dataType: "json"
        });
    };

    function displayTime(ticks) {
        var ticksInSeconds = ticks / 10000000;
        var hh = Math.floor(ticksInSeconds / 3600);
        var mm = Math.floor((ticksInSeconds % 3600) / 60);
        var ss = Math.floor(ticksInSeconds % 60);

        return pad(hh, 2) + ":" + pad(mm, 2) + ":" + pad(ss, 2);
    }

    function pad(n, width) {
        n = n + '';
        return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
    }

export default function (view, params) {

        // init code here
        view.addEventListener('viewshow', function (e) {

            setPageTabs("activity_report", view);

            var style = document.createElement('style');
            style.innerHTML =
                '.tooltip {position: relative;display: inline-block;border-bottom: 1px dotted black;} ' +
                '.tooltip .tooltiptext {visibility: hidden; background-color: black; color: #fff; border-radius: 6px; padding: 5px 0; position: absolute;z-index: 1;} ' +
                '.tooltip:hover .tooltiptext {visibility: visible;} ' +
                '.info_cell {white-space: nowrap; padding-left:45px; padding-right:20px; font-size:smaller;}' +
                '.info_cell_heading {white-space: nowrap; padding-left:20px; padding-right:20px;font-size:smaller;}';
            var ref = document.querySelector('script');
            ref.parentNode.insertBefore(style, ref);

            process_click();

            function process_click() {

                var url = "user_usage_stats/session_list?stamp=" + new Date().getTime();
                url = ApiClient.getUrl(url);

                var load_status = view.querySelector('#activity_report_status');
                load_status.innerHTML = "Loading Data...";

                ApiClient.getActivity(url).then(function (activity_data) {
                    load_status.innerHTML = "&nbsp;";
                    console.log("activity_data: " + JSON.stringify(activity_data));

                    var table_body = view.querySelector('#activity_report_results');
                    var row_html = "";

                    for (var index = 0; index < activity_data.length; ++index) {
                        var activity_info = activity_data[index];

                        var row_bg_col = "#BBBBBB00";
                        if (index % 2 == 0) {
                            row_bg_col = "#BBBBBB1C";
                        }

                        row_html += "<tr style='background:" + row_bg_col + ";'>";

                        // add user info
                        var user_image = "<span class='material-icons' style='font-size:30px;width:30px;height:30px;'>person</span>";
                        if (activity_info.has_image) {
                            var user_img = "Users/" + activity_info.user_id + "/Images/Primary?height=152&&quality=90";
                            user_img = ApiClient.getUrl(user_img);
                            user_image = "<img src='" + user_img + "' style='object-fit:cover;width:30px;height:30px;border-radius:1000px;vertical-align:top;'>";
                        }
                        row_html += "<td>";
                        row_html += "<table>";
                        row_html += "<tr>";
                        row_html += "<td style='vertical-align: middle; width:35px;' align='center'>" + user_image + "</td>";
                        row_html += "<td style='vertical-align: middle;'>" + activity_info.user_name + "</td>";
                        row_html += "</tr>";
                        row_html += "</table>";
                        row_html += "</td>";

                        // add device info
                        row_html += "<td>";
                        row_html += "<table style='line-height: 1; font-size: 80%;'>";
                        row_html += "<tr>";
                        // Jellyfin does not expose a client/app icon for sessions.
                        row_html += "<td rowspan='2'><span class='material-icons' style='font-size:30px;'>devices</span></td>";
                        row_html += "<td>" + activity_info.device_name + "</td>";
                        row_html += "</tr>";
                        row_html += "<tr>";
                        row_html += "<td>" + activity_info.client_name + " (" + activity_info.app_version + ")</td>";
                        row_html += "</tr>";
                        row_html += "</table>";
                        row_html += "</td>";



                        // add now playing info
                        if (activity_info.NowPlayingItem) {

                            // add item name
                            var item_name = activity_info.NowPlayingItem.Name;
                            if (activity_info.NowPlayingItem.Type === "Episode") {
                                item_name = activity_info.NowPlayingItem.SeriesName + " ";
                                item_name += "s" + pad(activity_info.NowPlayingItem.ParentIndexNumber, 2);
                                item_name += "e" + pad(activity_info.NowPlayingItem.IndexNumber, 2);
                                item_name += " " + activity_info.NowPlayingItem.Name;
                            }

                            // add playback item info
                            var complete_percentage = (activity_info.PlayState.PositionTicks / activity_info.NowPlayingItem.RunTimeTicks) * 100;
                            complete_percentage = Math.round(complete_percentage);
                            var duration = displayTime(activity_info.NowPlayingItem.RunTimeTicks);
                            var current = displayTime(activity_info.PlayState.PositionTicks);

                            var name_link = '#/details?id=' + activity_info.NowPlayingItem.Id + '&serverId=' + (ApiClient._serverInfo ? ApiClient._serverInfo.Id : '');
                            var item_link = "<a href='" + name_link + "' is='emby-linkbutton' class='button-link' title='View Emby item'>" + item_name + "</a>";

                            var direct_name_link = "/web/index.html#!/item?id=" + activity_info.NowPlayingItem.Id + "&serverId=" + ApiClient._serverInfo.Id;
                            var new_window = "<span class='material-icons' style='cursor: pointer; font-size:24px;' onClick='window.open(\"" + direct_name_link + "\");' title='Open item in new window'>launch</span>"

                            var item_name_link = item_link + "&nbsp;&nbsp;" + new_window;

                            row_html += "<td>";
                            row_html += item_name_link;
                            row_html += "<br />";
                            row_html += complete_percentage + "% (" + current + " / " + duration + ")";
                            row_html += "</td>";

                            // add playback details
                            var play_method_details = "";
                            play_method_details += "<table cellpadding='0' cellspacing='0'>";

                            if (activity_info.NowPlayingItem.MediaStreams && activity_info.NowPlayingItem.MediaStreams.length > 0) {
                                for (var media_index = 0; media_index < activity_info.NowPlayingItem.MediaStreams.length; media_index++) {
                                    var media = activity_info.NowPlayingItem.MediaStreams[media_index];
                                    if (media.Type === "Video") {
                                        play_method_details += "<tr><td class='info_cell_heading'>Original Video</td></tr>";
                                        play_method_details += "<tr><td class='info_cell'>Codec: " + media.Codec + "</td></tr>";
                                        play_method_details += "<tr><td class='info_cell'>Size: " + media.Width + "x" + media.Height + "</td></tr>";
                                        play_method_details += "<tr><td class='info_cell'>Framerate: " + media.RealFrameRate + "</td></tr>";
                                        play_method_details += "<tr><td class='info_cell'>Aspect Ratio: " + media.AspectRatio + "</td></tr>";
                                        play_method_details += "<tr><td class='info_cell'>Bitrate: " + media.BitRate + "</td></tr>";
                                        play_method_details += "<tr><td class='info_cell'>Interlaced: " + media.IsInterlaced + "</td></tr>";
                                    }
                                    if (media.Type === "Audio") {
                                        play_method_details += "<tr><td class='info_cell_heading'>Original Audio</td></tr>";
                                        play_method_details += "<tr><td class='info_cell'>Codec: " + media.Codec + "</td></tr>";
                                        play_method_details += "<tr><td class='info_cell'>Language: " + media.DisplayLanguage + "</td></tr>";
                                        play_method_details += "<tr><td class='info_cell'>Channels: " + media.Channels + "</td></tr>";
                                    }
                                }
                            }

                            if (activity_info.TranscodingInfo) {

                                play_method_details += "<tr><td class='info_cell_heading'>Transcoded Video</td></tr>";
                                play_method_details += "<tr><td class='info_cell'>Direct: " + activity_info.TranscodingInfo.IsVideoDirect + "</td></tr>";
                                play_method_details += "<tr><td class='info_cell'>Codec: " + activity_info.TranscodingInfo.VideoCodec + "</td></tr>";
                                play_method_details += "<tr><td class='info_cell'>Size: " + activity_info.TranscodingInfo.Width + "x" + activity_info.TranscodingInfo.Height + "</td></tr>";

                                if (activity_info.TranscodingInfo.VideoEncoderIsHardware) {
                                    var video_encoder_info = activity_info.TranscodingInfo.VideoEncoderHwAccel + " - " + activity_info.TranscodingInfo.VideoEncoderMediaType;
                                    play_method_details += "<tr><td class='info_cell'>Encoder: " + video_encoder_info + "</td></tr>";
                                }
                                else if (activity_info.TranscodingInfo.IsVideoDirect === false) {
                                    play_method_details += "<tr><td class='info_cell'>Encoder: Software</td></tr>";
                                }

                                if (activity_info.TranscodingInfo.VideoDecoderIsHardware) {
                                    var audio_encoder_info = activity_info.TranscodingInfo.VideoDecoderHwAccel + " - " + activity_info.TranscodingInfo.VideoDecoderMediaType;
                                    play_method_details += "<tr><td class='info_cell'>Decoder: " + audio_encoder_info + "</td></tr>";
                                }
                                else if (activity_info.TranscodingInfo.IsVideoDirect === false) {
                                    play_method_details += "<tr><td class='info_cell'>Decoder: Software</td></tr>";
                                }

                                play_method_details += "<tr><td class='info_cell_heading'>Transcoded Audio</td></tr>";
                                play_method_details += "<tr><td class='info_cell'>Direct: " + activity_info.TranscodingInfo.IsAudioDirect + "</td></tr>";
                                play_method_details += "<tr><td class='info_cell'>Codec: " + activity_info.TranscodingInfo.AudioCodec + "</td></tr>";
                                play_method_details += "<tr><td class='info_cell'>Channels: " + activity_info.TranscodingInfo.AudioChannels + "</td></tr>";

                                play_method_details += "<tr><td class='info_cell_heading'>Transcode Info</td></tr>";
                                play_method_details += "<tr><td class='info_cell'>Container: " + activity_info.TranscodingInfo.Container + "</td></tr>";
                                play_method_details += "<tr><td class='info_cell'>Bitrate: " + activity_info.TranscodingInfo.Bitrate + "</td></tr>";

                                if (activity_info.TranscodingInfo.Framerate) {
                                    play_method_details += "<tr><td class='info_cell'>Speed: " + activity_info.TranscodingInfo.Framerate + " fps</td></tr>";
                                }

                                if (activity_info.TranscodingInfo.TranscodingPositionTicks) {

                                    var trans_complete_percentage = (activity_info.TranscodingInfo.TranscodingPositionTicks / activity_info.NowPlayingItem.RunTimeTicks) * 100;
                                    trans_complete_percentage = Math.round(trans_complete_percentage);
                                    var trans_duration = displayTime(activity_info.NowPlayingItem.RunTimeTicks);
                                    var trans_current = displayTime(activity_info.TranscodingInfo.TranscodingPositionTicks);

                                    play_method_details += "<tr><td class='info_cell'>Position: " +
                                        trans_complete_percentage + "% (" + trans_current + " / " + trans_duration + ")</td></tr>";
                                }
                                else {
                                    play_method_details += "<tr><td class='info_cell'>Position: Finished</td></tr>";
                                }

                                if (activity_info.TranscodingInfo.TranscodeReasons && activity_info.TranscodingInfo.TranscodeReasons.length > 0) {

                                    play_method_details += "<tr><td class='info_cell_heading'>Transcode Reasons</td></tr>";
                                    for (var reason_index = 0; reason_index < activity_info.TranscodingInfo.TranscodeReasons.length; reason_index++) {
                                        play_method_details += "<tr><td class='info_cell'>" + activity_info.TranscodingInfo.TranscodeReasons[reason_index] + "</td></tr>";
                                    }
                                }
                            }

                            play_method_details += "</table>";
                            row_html += "<td>";
                            row_html += "<div class='tooltip'>";
                            row_html += activity_info.PlayState.PlayMethod;
                            row_html += "<br />";
                            row_html += "<span class='tooltiptext'>" + play_method_details + "</span>";
                            row_html += "</div>";
                            row_html += "</td>";
                        }
                        else {
                            row_html += "<td>&nbsp;</td>";
                            row_html += "<td>&nbsp;</td>";
                        }

                        row_html += "<td>";
                        row_html += activity_info.last_active;
                        row_html += "<br />";
                        row_html += activity_info.remote_address;
                        row_html += "</td>";

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