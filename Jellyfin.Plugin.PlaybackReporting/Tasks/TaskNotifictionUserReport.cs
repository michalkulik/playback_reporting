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
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.PlaybackReporting.Data;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Activity;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;
using User = Jellyfin.Database.Implementations.Entities.User;

namespace Jellyfin.Plugin.PlaybackReporting.Tasks
{
    public class TaskNotifictionUserReport : IScheduledTask
    {
        private readonly IActivityManager _activity;
        private readonly ILogger<TaskNotifictionUserReport> _logger;
        private readonly IServerConfigurationManager _config;
        private readonly IUserManager _userManager;

        public string Name => "User Activity Notification";
        public string Key => "UserActivityReportNotification";
        public string Description => "Write a user activity report to the activity log";
        public string Category => "Playback Reporting";

        public TaskNotifictionUserReport(
            IActivityManager activity,
            IServerConfigurationManager config,
            IUserManager userManager,
            ILoggerFactory loggerFactory)
        {
            _logger = loggerFactory.CreateLogger<TaskNotifictionUserReport>();
            _activity = activity;
            _config = config;
            _userManager = userManager;
        }

        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
        {
            return new[]
            {
                new TaskTriggerInfo
                {
                    Type = TaskTriggerInfoType.DailyTrigger,
                    TimeOfDayTicks = TimeSpan.FromMinutes(20).Ticks
                } //12:20am daily
            };
        }

        public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
        {
            Dictionary<string, string> user_map = new Dictionary<string, string>();
            foreach (User user in _userManager.GetUsers())
            {
                string user_id = user.Id.ToString("N");
                string user_name = user.Username;
                if (!string.IsNullOrEmpty(user_id) && !string.IsNullOrEmpty(user_name))
                {
                    user_map[user_id] = user_name;
                }
            }

            ActivityRepository repository = ActivityRepository.GetInstance(_config.ApplicationPaths.DataPath, _logger);
            ReportPlaybackOptions config = _config.GetReportPlaybackOptions();

            DateTime last_checked = config.LastUserActivityCheck;
            string date_from = last_checked.ToString("yyyy-MM-dd HH:mm:ss.FFFFFFF", CultureInfo.InvariantCulture);

            string sql = "";
            sql += "SELECT UserId, ItemType, ItemName, SUM(PlayDuration - PauseDuration) AS PlayTime ";
            sql += "FROM PlaybackActivity ";
            sql += "WHERE DateCreated > '" + date_from + "' ";
            sql += "AND UserId not IN (select UserId from UserList) ";

            if (config.IgnoreSmallerThan > 0)
            {
                sql += "AND (PlayDuration - PauseDuration) > " + config.IgnoreSmallerThan + " ";
            }

            sql += "GROUP BY UserId, ItemType, ItemName";

            _logger.Info("Activity Query : " + sql);

            List<string> cols = new List<string>();
            List<List<object>> results = new List<List<object>>();
            repository.RunCustomQuery(sql, cols, results);

            TimeSpan since_last = DateTime.Now - last_checked;
            _logger.Info("Cutoff DateTime for new items - date: " + date_from + " ago: " + since_last);

            string since_last_string = string.Format("{0}{1}{2}",
                since_last.Duration().Days > 0 ? string.Format("{0:0} day{1} ", since_last.Days, since_last.Days == 1 ? String.Empty : "s") : string.Empty,
                since_last.Duration().Hours > 0 ? string.Format("{0:0} hour{1} ", since_last.Hours, since_last.Hours == 1 ? String.Empty : "s") : string.Empty,
                since_last.Duration().Minutes > 0 ? string.Format("{0:0} minute{1} ", since_last.Minutes, since_last.Minutes == 1 ? String.Empty : "s") : string.Empty);
            if (string.IsNullOrEmpty(since_last_string))
            {
                since_last_string = "0 minutes";
            }
            string message = "User activity since last check " + since_last_string + "ago.\r\n";

            int item_count = 0;
            string last_user = "";
            foreach (List<object> row in results)
            {
                string user_id = row[0] as string;
                string item_type = row[1] as string;
                string item_name = row[2] as string;
                int item_playtime = 0;
                int.TryParse(row[3] as string, out item_playtime);

                TimeSpan play_span = TimeSpan.FromSeconds(item_playtime);
                string play_time_string = string.Format("{0:D2}:{1:D2}:{2:D2}",
                    play_span.Hours,
                    play_span.Minutes,
                    play_span.Seconds);

                if (play_span.Days > 0)
                {
                    play_time_string = string.Format("{0}.{1:D2}:{2:D2}:{3:D2}",
                        play_span.Days,
                        play_span.Hours,
                        play_span.Minutes,
                        play_span.Seconds);
                }

                if (last_user != user_id)
                {
                    string user_name = "Unknown:" + user_id;
                    if (!string.IsNullOrEmpty(user_id) && user_map.ContainsKey(user_id))
                    {
                        user_name = user_map[user_id];
                    }
                    message += "\r\n" + user_name + "\r\n";
                    last_user = user_id;
                }
                item_count++;
                message += " - (" + item_type + ") " + item_name + " (" + play_time_string + ")\r\n";
            }

            _logger.Info("User activity Message : ItemCount : " + item_count);

            if (item_count > 0)
            {
                await ActivityLogWriter.WriteAsync(_activity, _logger, "User Activity Report Notification", message).ConfigureAwait(false);
            }

            config.LastUserActivityCheck = DateTime.Now;
            _config.SaveReportPlaybackOptions(config);
        }
    }
}
