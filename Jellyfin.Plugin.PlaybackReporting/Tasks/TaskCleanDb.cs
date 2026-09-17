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
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.PlaybackReporting.Data;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Model.Activity;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.PlaybackReporting.Tasks
{
    public class TaskCleanDb : IScheduledTask
    {
        private readonly IActivityManager _activity;
        private readonly ILogger<TaskCleanDb> _logger;
        private readonly IServerConfigurationManager _config;

        public string Name => "Trim Db";
        public string Key => "PlaybackHistoryTrimTask";
        public string Description => "Runs the report history trim task";
        public string Category => "Playback Reporting";

        public TaskCleanDb(IActivityManager activity, IServerConfigurationManager config, ILoggerFactory loggerFactory)
        {
            _logger = loggerFactory.CreateLogger<TaskCleanDb>();
            _activity = activity;
            _config = config;
        }

        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
        {
            return new[]
            {
                new TaskTriggerInfo
                {
                    Type = TaskTriggerInfoType.DailyTrigger,
                    TimeOfDayTicks = TimeSpan.FromMinutes(5).Ticks
                } //12:05am
            };
        }

        public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
        {
            await Task.Run(() =>
            {
                _logger.Info("Playback Reporting Data Trim");

                ReportPlaybackOptions config = _config.GetReportPlaybackOptions();
                int max_data_age = config.MaxDataAge;

                _logger.Info("MaxDataAge : " + max_data_age);

                if (max_data_age == -1)
                {
                    _logger.Info("Keep data forever, not doing any data cleanup");
                    return;
                }

                ActivityRepository db_repo = ActivityRepository.GetInstance(_config.ApplicationPaths.DataPath, _logger);
                if (max_data_age == 0)
                {
                    _logger.Info("Removing all data");
                    db_repo.DeleteOldData(null);
                }
                else
                {
                    DateTime del_before = DateTime.Now.AddMonths(max_data_age * -1);
                    db_repo.DeleteOldData(del_before);
                }
            }, cancellationToken).ConfigureAwait(false);
        }
    }
}
