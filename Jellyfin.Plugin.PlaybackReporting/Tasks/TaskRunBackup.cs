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
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Model.Activity;
using MediaBrowser.Model.IO;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.PlaybackReporting.Tasks
{
    public class TaskRunBackup : IScheduledTask
    {
        private readonly IActivityManager _activity;
        private readonly ILogger<TaskRunBackup> _logger;
        private readonly IServerConfigurationManager _config;
        private readonly IFileSystem _fileSystem;

        public string Name => "Run Backup";
        public string Key => "PlaybackHistoryRunBackup";
        public string Description => "Runs the report data backup";
        public string Category => "Playback Reporting";

        public TaskRunBackup(
            IActivityManager activity,
            IServerConfigurationManager config,
            IFileSystem fileSystem,
            ILoggerFactory loggerFactory)
        {
            _logger = loggerFactory.CreateLogger<TaskRunBackup>();
            _activity = activity;
            _config = config;
            _fileSystem = fileSystem;
        }

        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
        {
            return new[]
            {
                new TaskTriggerInfo
                {
                    Type = TaskTriggerInfoType.WeeklyTrigger,
                    DayOfWeek = DayOfWeek.Sunday,
                    TimeOfDayTicks = TimeSpan.FromHours(3).Ticks
                } //3am on Sunday
            };
        }

        public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
        {
            await Task.Run(() =>
            {
                BackupManager backup = new BackupManager(_config, _logger, _fileSystem);
                backup.SaveBackup();
            }, cancellationToken).ConfigureAwait(false);
        }
    }
}
