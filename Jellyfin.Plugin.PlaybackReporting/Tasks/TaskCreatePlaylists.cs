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
using Jellyfin.Data.Enums;
using Jellyfin.Plugin.PlaybackReporting.Data;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Playlists;
using MediaBrowser.Model.Playlists;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.PlaybackReporting.Tasks
{
    public class TaskCreatePlaylists : IScheduledTask
    {
        private readonly ILogger<TaskCreatePlaylists> _logger;
        private readonly IPlaylistManager _playlistman;
        private readonly ILibraryManager _libraryManager;
        private readonly IServerConfigurationManager _config;

        public string Name => "Create Playlists";
        public string Key => "PlaybackReportingCreatePlaylists";
        public string Description => "Creates playlists for most popular items based on user activity";
        public string Category => "Playback Reporting";

        public TaskCreatePlaylists(
            IServerConfigurationManager config,
            IPlaylistManager playlistman,
            ILibraryManager libraryManager,
            ILoggerFactory loggerFactory)
        {
            _logger = loggerFactory.CreateLogger<TaskCreatePlaylists>();
            _playlistman = playlistman;
            _libraryManager = libraryManager;
            _config = config;
        }

        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
        {
            return new[]
            {
                new TaskTriggerInfo
                {
                    Type = TaskTriggerInfoType.DailyTrigger,
                    TimeOfDayTicks = TimeSpan.FromHours(3).Ticks
                } //3am daily
            };
        }

        public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
        {
            ActivityRepository repository = ActivityRepository.GetInstance(_config.ApplicationPaths.DataPath, _logger);
            ReportPlaybackOptions config = _config.GetReportPlaybackOptions();

            foreach (var activity_playlist in config.ActivityPlaylists)
            {
                string list_name = activity_playlist.Name;
                string list_type = activity_playlist.Type;
                int list_days = activity_playlist.Days;
                int list_size = activity_playlist.Size;

                _logger.Info("Activity Playlist - Name:" + list_name + " Type:" + list_type + " Days:" + list_days);

                string sql = "";
                sql += "SELECT ItemId, ";
                sql += "COUNT(DISTINCT(UserId)) as count, ";
                sql += "AVG(CAST(strftime('%Y%m%d%H%M', 'now', 'localtime') AS int) - CAST(strftime('%Y%m%d%H%M', DateCreated) AS int)) as av_age ";
                sql += "FROM PlaybackActivity ";
                sql += "WHERE ItemType = '" + list_type + "' ";
                sql += "AND DateCreated > datetime('now', '-" + list_days + " day', 'localtime') ";
                sql += "AND UserId not IN (select UserId from UserList) ";

                if (config.IgnoreSmallerThan > 0)
                {
                    sql += "AND (PlayDuration - PauseDuration) > " + config.IgnoreSmallerThan + " ";
                }

                sql += "GROUP BY ItemId ";
                sql += "ORDER BY count DESC, av_age ASC ";
                sql += "LIMIT " + list_size;

                _logger.Info("Activity Query : " + sql);

                List<string> cols = new List<string>();
                List<List<object>> query_results = new List<List<object>>();
                repository.RunCustomQuery(sql, cols, query_results);

                List<Guid> items = new List<Guid>();
                foreach (List<object> row in query_results)
                {
                    if (row.Count > 0 && Guid.TryParse(row[0] as string, out Guid item_id))
                    {
                        items.Add(item_id);
                    }
                }

                // create a playlist with the most active items
                string playlist_name = list_name;
                InternalItemsQuery query = new InternalItemsQuery();
                query.IncludeItemTypes = new[] { BaseItemKind.Playlist };
                query.Name = playlist_name;

                IReadOnlyList<BaseItem> results = _libraryManager.GetItemList(query);
                foreach (BaseItem item in results)
                {
                    _logger.Info("Deleting Existing Playlist : " + item.Id);
                    DeleteOptions delete_options = new DeleteOptions();
                    delete_options.DeleteFileLocation = true;
                    _libraryManager.DeleteItem(item, delete_options);
                }

                if (items.Count == 0)
                {
                    _logger.Info("No items for playlist : " + playlist_name);
                    continue;
                }

                _logger.Info("Creating Playlist");
                PlaylistCreationRequest create_options = new PlaylistCreationRequest();
                create_options.Name = playlist_name;
                create_options.MediaType = (list_type == "Movie" || list_type == "Episode") ? MediaType.Video : MediaType.Audio;
                create_options.ItemIdList = items;

                await _playlistman.CreatePlaylist(create_options).ConfigureAwait(false);
            }
        }
    }
}
