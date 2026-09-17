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
using System.Threading.Tasks;
using MediaBrowser.Model.Activity;
using Microsoft.Extensions.Logging;
using ActivityLog = Jellyfin.Database.Implementations.Entities.ActivityLog;

namespace Jellyfin.Plugin.PlaybackReporting
{
    /// <summary>
    /// Jellyfin has no equivalent of the Emby notification type extensibility.
    /// Reports produced by the notification tasks are written to the activity log instead.
    /// </summary>
    public static class ActivityLogWriter
    {
        public static async Task WriteAsync(IActivityManager activityManager, ILogger logger, string name, string message)
        {
            if (activityManager == null)
            {
                return;
            }

            try
            {
                var entry = new ActivityLog(name, "PlaybackReporting", Guid.Empty)
                {
                    Overview = message,
                    ShortOverview = message,
                    DateCreated = DateTime.UtcNow,
                    LogSeverity = LogLevel.Information
                };

                await activityManager.CreateAsync(entry).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                logger?.LogError(ex, "Failed to write playback reporting activity log entry");
            }
        }
    }
}
