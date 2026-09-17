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

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Audio;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Activity;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.PlaybackReporting.Tasks
{
    public class TaskNotifictionMediaReport : IScheduledTask
    {
        private readonly IActivityManager _activity;
        private readonly ILogger<TaskNotifictionMediaReport> _logger;
        private readonly IServerConfigurationManager _config;
        private readonly ILibraryManager _libraryManager;

        public string Name => "New Media Notification";
        public string Key => "NewMediaNotification";
        public string Description => "Write a new media report to the activity log";
        public string Category => "Playback Reporting";

        public TaskNotifictionMediaReport(
            IActivityManager activity,
            IServerConfigurationManager config,
            ILibraryManager libraryManager,
            ILoggerFactory loggerFactory)
        {
            _logger = loggerFactory.CreateLogger<TaskNotifictionMediaReport>();
            _activity = activity;
            _config = config;
            _libraryManager = libraryManager;
        }

        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
        {
            return new[]
            {
                new TaskTriggerInfo
                {
                    Type = TaskTriggerInfoType.DailyTrigger,
                    TimeOfDayTicks = TimeSpan.FromHours(6).Ticks
                } //6am daily
            };
        }

        public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
        {
            Folder[] views = _libraryManager.GetUserRootFolder().Children.OfType<Folder>().ToArray();
            int added_count = 0;

            ReportPlaybackOptions config = _config.GetReportPlaybackOptions();

            DateTime cutoff = config.LastNewMediaCheck;
            string last_check = cutoff.ToString("yyyy/MM/dd HH:mm:ss zzz");

            TimeSpan since_last = DateTime.Now - cutoff;
            _logger.Info("Cutoff DateTime for new items - date: " + last_check + " ago: " + since_last);

            string since_last_string = string.Format("{0}{1}{2}",
                since_last.Duration().Days > 0 ? string.Format("{0:0} day{1} ", since_last.Days, since_last.Days == 1 ? String.Empty : "s") : string.Empty,
                since_last.Duration().Hours > 0 ? string.Format("{0:0} hour{1} ", since_last.Hours, since_last.Hours == 1 ? String.Empty : "s") : string.Empty,
                since_last.Duration().Minutes > 0 ? string.Format("{0:0} minute{1} ", since_last.Minutes, since_last.Minutes == 1 ? String.Empty : "s") : string.Empty);
            if (string.IsNullOrEmpty(since_last_string))
            {
                since_last_string = "0 minutes";
            }
            string message = "New media added since last check " + since_last_string + "ago.\r\n\r\n";

            foreach (Folder folder in views)
            {
                _logger.Info("Checking for new items in : " + folder.Name);

                InternalItemsQuery query = new InternalItemsQuery();
                query.IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Episode, BaseItemKind.Audio, BaseItemKind.Video };
                query.AncestorIds = new Guid[] { folder.Id };
                query.Recursive = true;
                query.IsVirtualItem = false;

                IReadOnlyList<BaseItem> results = _libraryManager.GetItemList(query);

                int view_added_count = 0;
                string view_message_data = folder.Name + "\r\n";

                foreach (BaseItem item in results)
                {
                    DateTime item_date_added = item.DateCreated.ToLocalTime();
                    if (item_date_added < cutoff)
                    {
                        continue;
                    }

                    string id = item.Id.ToString("N");
                    string name = item.Name;
                    string type = item.GetType().Name;
                    string item_timestamp = item_date_added.ToString("yyyy-MM-dd HH:mm:ss zzz");
                    _logger.Info("Recently added item : (" + id + ":" + type + ":" + name + ") - (" + item_timestamp + ")");

                    view_added_count++;

                    if (typeof(Episode).Equals(item.GetType()))
                    {
                        Episode epp = item as Episode;
                        string series = epp.SeriesName;
                        string epp_number = string.Format("{0:D2}x{1:D2}", epp.ParentIndexNumber, epp.IndexNumber);
                        view_message_data += " - (" + type + ") " + series + " - " + epp_number + " - " + name + "\r\n";
                    }
                    else if (typeof(Movie).Equals(item.GetType()))
                    {
                        view_message_data += " - (" + type + ") " + name + " (" + item.ProductionYear + ")\r\n";
                    }
                    else if (typeof(Audio).Equals(item.GetType()))
                    {
                        Audio audio = item as Audio;
                        string album = audio.Album;
                        string artist = audio.Artists != null && audio.Artists.Count > 0 ? audio.Artists[0] : "Unknown Artist";
                        view_message_data += " - (" + type + ") " + artist + " - " + name + " - " + album + " (" + item.ProductionYear + ")\r\n";
                    }
                    else
                    {
                        view_message_data += " - (" + type + ") " + name + " (" + item.ProductionYear + ")\r\n";
                    }
                }

                if (view_added_count > 0)
                {
                    message += view_message_data + "\r\n";
                }

                added_count += view_added_count;
            }

            _logger.Info("Added Item Notification Message : ItemCount : " + added_count);

            if (added_count > 0)
            {
                await ActivityLogWriter.WriteAsync(_activity, _logger, "New Media Report Notification", message).ConfigureAwait(false);
            }

            config.LastNewMediaCheck = DateTime.Now;
            _config.SaveReportPlaybackOptions(config);
        }
    }
}
