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
using System.IO;
using System.Linq;
using Jellyfin.Data.Enums;
using Jellyfin.Plugin.PlaybackReporting.Data;
using MediaBrowser.Common.Api;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.IO;
using MediaBrowser.Model.Querying;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using User = Jellyfin.Database.Implementations.Entities.User;

namespace Jellyfin.Plugin.PlaybackReporting.Api
{
    /// <summary>
    /// REST API for the Playback Reporting plugin.
    /// Ported from the Emby ServiceStack <c>UserActivityAPI</c> to an ASP.NET Core controller.
    /// The routes are kept identical to the Emby plugin so the bundled pages keep working.
    /// </summary>
    [ApiController]
    [Authorize(Policy = Policies.RequiresElevation)]
    [Route("user_usage_stats")]
    public class PlaybackReportingActivityController : ControllerBase
    {
        private readonly ILogger<PlaybackReportingActivityController> _logger;
        private readonly ILoggerFactory _loggerFactory;
        private readonly IFileSystem _fileSystem;
        private readonly IServerConfigurationManager _config;
        private readonly IUserManager _userManager;
        private readonly IUserDataManager _userDataManager;
        private readonly ILibraryManager _libraryManager;
        private readonly ISessionManager _sessionManager;

        public PlaybackReportingActivityController(
            ILoggerFactory loggerFactory,
            IFileSystem fileSystem,
            IServerConfigurationManager config,
            IUserManager userManager,
            IUserDataManager userDataManager,
            ILibraryManager libraryManager,
            ISessionManager sessionManager)
        {
            _loggerFactory = loggerFactory;
            _logger = loggerFactory.CreateLogger<PlaybackReportingActivityController>();
            _fileSystem = fileSystem;
            _config = config;
            _userManager = userManager;
            _userDataManager = userDataManager;
            _libraryManager = libraryManager;
            _sessionManager = sessionManager;
        }

        private ActivityRepository GetRepository()
        {
            return ActivityRepository.GetInstance(_config.ApplicationPaths.DataPath, _logger);
        }

        private static DateTime ParseEndDate(string end_date)
        {
            if (string.IsNullOrEmpty(end_date))
            {
                return DateTime.Now;
            }

            return DateTime.ParseExact(end_date, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        // GET /user_usage_stats/session_list
        [HttpGet("session_list")]
        public ActionResult GetSessionInfo()
        {
            List<Dictionary<string, object>> report = new List<Dictionary<string, object>>();

            foreach (SessionInfo session in _sessionManager.Sessions)
            {
                Dictionary<string, object> data = new Dictionary<string, object>();

                data.Add("TranscodingInfo", session.TranscodingInfo);
                data.Add("PlayState", session.PlayState);
                data.Add("NowPlayingItem", session.NowPlayingItem);
                data.Add("device_name", session.DeviceName);
                data.Add("client_name", session.Client);
                data.Add("app_icon", (object)null);
                data.Add("app_version", session.ApplicationVersion);

                data.Add("has_user", session.UserId != Guid.Empty);
                data.Add("user_id", session.UserId.ToString("N"));
                data.Add("user_name", session.UserName);
                data.Add("has_image", !string.IsNullOrEmpty(session.UserPrimaryImageTag));

                data.Add("remote_address", session.RemoteEndPoint);

                TimeSpan ts = DateTime.UtcNow.Subtract(session.LastActivityDate.ToUniversalTime());
                data.Add("last_active", ts.ToString(@"dd\.hh\:mm\:ss"));

                report.Add(data);
            }

            return Ok(report);
        }

        // GET /user_usage_stats/user_activity?days=&end_date=
        [HttpGet("user_activity")]
        public ActionResult GetUserReport([FromQuery] int days, [FromQuery] string end_date)
        {
            DateTime endDate = ParseEndDate(end_date);

            List<Dictionary<string, object>> report = GetRepository().GetUserReport(days, endDate);

            foreach (var user_info in report)
            {
                string user_id = user_info["user_id"] as string;
                User user = null;
                if (!string.IsNullOrEmpty(user_id) && Guid.TryParse(user_id, out Guid user_guid))
                {
                    user = _userManager.GetUserById(user_guid);
                }

                user_info["user_name"] = user?.Username ?? "Not Known";
                user_info["has_image"] = user?.ProfileImage != null;

                DateTime last_seen = Convert.ToDateTime(user_info["latest_date"]);
                TimeSpan time_ago = DateTime.Now.Subtract(last_seen);

                string last_seen_string = GetLastSeenString(time_ago);
                if (last_seen_string == "")
                {
                    last_seen_string = "just now";
                }
                user_info["last_seen"] = last_seen_string;

                long seconds = Convert.ToInt64(user_info["total_time"]);
                TimeSpan total_time = new TimeSpan(10000000L * seconds);

                string time_played = GetLastSeenString(total_time);
                if (time_played == "")
                {
                    time_played = "< 1m";
                }
                user_info["total_play_time"] = time_played;
            }

            return Ok(report);
        }

        // GET /user_usage_stats/user_manage/{action}/{id}
        [HttpGet("user_manage/{action}/{id}")]
        public ActionResult GetUserManage([FromRoute] string action, [FromRoute] string id)
        {
            ActivityRepository db_repo = GetRepository();

            if (action == "remove_unknown")
            {
                List<string> user_id_list = new List<string>();
                foreach (User user in _userManager.GetUsers())
                {
                    user_id_list.Add(user.Id.ToString("N"));
                }
                int removed_count = db_repo.RemoveUnknownUsers(user_id_list);
                return Ok(removed_count);
            }
            else
            {
                db_repo.ManageUserList(action, id);
                return Ok(1);
            }
        }

        // GET /user_usage_stats/user_list
        [HttpGet("user_list")]
        public ActionResult GetUserList()
        {
            ActivityRepository db_repo = GetRepository();
            List<string> user_id_list = db_repo.GetUserList();

            List<Dictionary<string, object>> users = new List<Dictionary<string, object>>();

            foreach (User user in _userManager.GetUsers())
            {
                Dictionary<string, object> user_info = new Dictionary<string, object>();
                user_info.Add("name", user.Username);
                user_info.Add("id", user.Id.ToString("N"));
                user_info.Add("in_list", user_id_list.Contains(user.Id.ToString("N")));
                users.Add(user_info);
            }

            return Ok(users);
        }

        // GET /user_usage_stats/type_filter_list
        [HttpGet("type_filter_list")]
        public ActionResult GetTypeFilterList()
        {
            return Ok(GetRepository().GetTypeFilterList());
        }

        // POST /user_usage_stats/import_backup
        [HttpPost("import_backup")]
        public ActionResult ImportBackup()
        {
            int count = 0;
            try
            {
                using (StreamReader sr = new StreamReader(Request.Body))
                {
                    string load_data = sr.ReadToEnd();
                    count = GetRepository().ImportRawData(load_data);
                }
            }
            catch (Exception e)
            {
                return Ok(new List<string>() { e.Message });
            }

            return Ok(new List<string>() { "Backup loaded " + count + " items" });
        }

        // POST /user_usage_stats/submit_custom_query
        [HttpPost("submit_custom_query")]
        public ActionResult CustomQuery([FromBody] CustomQueryData data)
        {
            if (data == null)
            {
                data = new CustomQueryData();
            }

            _logger.Debug("CustomQuery : " + data.CustomQueryString);

            Dictionary<string, object> responce = new Dictionary<string, object>();

            List<List<object>> result = new List<List<object>>();
            List<string> colums = new List<string>();
            ActivityRepository db_repo = GetRepository();
            string message = db_repo.RunCustomQuery(data.CustomQueryString, colums, result);

            int index_of_user_col = colums.IndexOf("UserId");
            if (data.ReplaceUserId && index_of_user_col > -1)
            {
                colums[index_of_user_col] = "UserName";

                Dictionary<string, string> user_map = new Dictionary<string, string>();
                foreach (User user in _userManager.GetUsers())
                {
                    user_map[user.Id.ToString("N")] = user.Username;
                }

                foreach (var row in result)
                {
                    string user_id = row[index_of_user_col] as string;
                    if (user_id != null && user_map.ContainsKey(user_id))
                    {
                        row[index_of_user_col] = user_map[user_id];
                    }
                }
            }

            responce.Add("colums", colums);
            responce.Add("results", result);
            responce.Add("message", message);

            return Ok(responce);
        }

        // GET /user_usage_stats/load_backup?backupfile=
        [HttpGet("load_backup")]
        public ActionResult LoadBackup([FromQuery] string backupfile)
        {
            FileInfo fi = new FileInfo(backupfile);
            if (fi.Exists == false)
            {
                return Ok(new List<string>() { "Backup file does not exist" });
            }

            int count = 0;
            try
            {
                string load_data = "";
                using (StreamReader sr = new StreamReader(new FileStream(fi.FullName, FileMode.Open)))
                {
                    load_data = sr.ReadToEnd();
                }
                count = GetRepository().ImportRawData(load_data);
            }
            catch (Exception e)
            {
                return Ok(new List<string>() { e.Message });
            }

            return Ok(new List<string>() { "Backup loaded " + count + " items" });
        }

        // GET /user_usage_stats/save_backup
        [HttpGet("save_backup")]
        public ActionResult SaveBackup()
        {
            BackupManager bum = new BackupManager(_config, _logger, _fileSystem);
            string message = bum.SaveBackup();

            return Ok(new List<string>() { message });
        }

        // GET /user_usage_stats/PlayActivity?days=&end_date=&filter=&data_type=
        [HttpGet("PlayActivity")]
        public ActionResult GetUsageStats(
            [FromQuery] int days,
            [FromQuery] string end_date,
            [FromQuery] string filter,
            [FromQuery] string data_type)
        {
            string[] filter_tokens = new string[0];
            if (filter != null)
            {
                filter_tokens = filter.Split(',');
            }

            DateTime endDate = ParseEndDate(end_date);

            ReportPlaybackOptions config = _config.GetReportPlaybackOptions();
            Dictionary<String, Dictionary<string, int>> results = GetRepository().GetUsageForDays(days, endDate, filter_tokens, data_type, config);

            // add empty user for labels
            results.Add("labels_user", new Dictionary<string, int>());

            List<Dictionary<string, object>> user_usage_data = new List<Dictionary<string, object>>();
            foreach (string user_id in results.Keys)
            {
                Dictionary<string, int> user_usage = results[user_id];

                // fill in missing dates for time period
                SortedDictionary<string, int> userUsageByDate = new SortedDictionary<string, int>();
                DateTime from_date = endDate.AddDays((days * -1) + 1);
                while (from_date <= endDate)
                {
                    string date_string = from_date.ToString("yyyy-MM-dd");
                    if (user_usage.ContainsKey(date_string) == false)
                    {
                        userUsageByDate.Add(date_string, 0);
                    }
                    else
                    {
                        userUsageByDate.Add(date_string, user_usage[date_string]);
                    }

                    from_date = from_date.AddDays(1);
                }

                string user_name = "Not Known";
                if (user_id == "labels_user")
                {
                    user_name = "labels_user";
                }
                else
                {
                    User user = null;
                    try
                    {
                        Guid user_guid = new Guid(user_id);
                        user = _userManager.GetUserById(user_guid);
                    }
                    catch (Exception e)
                    {
                        _logger.Error("Error parsing user GUID : (" + user_id + ")", e);
                    }

                    if (user != null)
                    {
                        user_name = user.Username;
                    }
                    else
                    {
                        // if we could not get the user just use the user ID
                        user_name = user_id;
                    }
                }

                Dictionary<string, object> user_data = new Dictionary<string, object>();
                user_data.Add("user_id", user_id);
                user_data.Add("user_name", user_name);
                user_data.Add("user_usage", userUsageByDate);

                user_usage_data.Add(user_data);
            }

            var sorted_data = user_usage_data.OrderBy(dict => (dict["user_name"] as string).ToLower());

            return Ok(sorted_data);
        }

        // GET /user_usage_stats/{userId}/{date}/GetItems?filter=
        [HttpGet("{userId}/{date}/GetItems")]
        public ActionResult GetUserReportData(
            [FromRoute] string userId,
            [FromRoute] string date,
            [FromQuery] string filter)
        {
            string[] filter_tokens = new string[0];
            if (filter != null)
            {
                filter_tokens = filter.Split(',');
            }

            ReportPlaybackOptions config = _config.GetReportPlaybackOptions();
            List<Dictionary<string, string>> results = GetRepository().GetUsageForUser(date, userId, filter_tokens, config);

            List<Dictionary<string, object>> user_activity = new List<Dictionary<string, object>>();

            foreach (Dictionary<string, string> item_data in results)
            {
                Dictionary<string, object> item_info = new Dictionary<string, object>();

                item_info["Time"] = item_data["Time"];
                item_info["Id"] = item_data["Id"];
                item_info["Name"] = item_data["ItemName"];
                item_info["Type"] = item_data["Type"];
                item_info["Client"] = item_data["ClientName"];
                item_info["Method"] = item_data["PlaybackMethod"];
                item_info["Device"] = item_data["DeviceName"];
                item_info["Duration"] = item_data["PlayDuration"];
                item_info["RowId"] = item_data["RowId"];
                item_info["RemoteAddress"] = item_data["RemoteAddress"];

                user_activity.Add(item_info);
            }

            string user_name = "unknown";
            bool has_image = false;
            try
            {
                Guid user_guid = new Guid(userId);
                User user = _userManager.GetUserById(user_guid);
                if (user != null)
                {
                    user_name = user.Username;
                    has_image = user.ProfileImage != null;
                }
            }
            catch (Exception) { }

            Dictionary<string, object> user_details = new Dictionary<string, object>();
            user_details["has_image"] = has_image;
            user_details["user_name"] = user_name;
            user_details["user_id"] = userId;
            user_details["activity"] = user_activity;

            return Ok(user_details);
        }

        // GET /user_usage_stats/UserPlaylist?user_id=&aggregate_data=&filter_name=&days=&end_date=&filter=
        [HttpGet("UserPlaylist")]
        public ActionResult GetUserPlaylist(
            [FromQuery] string user_id,
            [FromQuery] bool aggregate_data,
            [FromQuery] string filter_name,
            [FromQuery] int days,
            [FromQuery] string end_date,
            [FromQuery] string filter)
        {
            DateTime endDate = ParseEndDate(end_date);

            ReportPlaybackOptions config = _config.GetReportPlaybackOptions();
            List<Dictionary<string, object>> report = GetRepository().GetUserPlayListReport(
                days,
                endDate,
                user_id,
                filter_name,
                aggregate_data,
                null,
                config);

            foreach (var row in report)
            {
                string row_user_id = row["user_id"] as string;
                User user = null;
                if (!string.IsNullOrEmpty(row_user_id) && Guid.TryParse(row_user_id, out Guid user_guid))
                {
                    user = _userManager.GetUserById(user_guid);
                }

                if (user != null)
                {
                    row["user_name"] = user.Username;
                    row["user_has_image"] = user.ProfileImage != null;
                }
                else
                {
                    row["user_name"] = "unknown";
                    row["user_has_image"] = false;
                }
            }

            return Ok(report);
        }

        // GET /user_usage_stats/HourlyReport?user_id=&days=&end_date=&filter=
        [HttpGet("HourlyReport")]
        public ActionResult GetHourlyReport(
            [FromQuery] string user_id,
            [FromQuery] int days,
            [FromQuery] string end_date,
            [FromQuery] string filter)
        {
            string[] filter_tokens = new string[0];
            if (filter != null)
            {
                filter_tokens = filter.Split(',');
            }

            DateTime endDate = ParseEndDate(end_date);

            ReportPlaybackOptions config = _config.GetReportPlaybackOptions();
            SortedDictionary<string, int> report = GetRepository().GetHourlyUsageReport(
                user_id,
                days,
                endDate,
                filter_tokens,
                config);

            for (int day = 0; day < 7; day++)
            {
                for (int hour = 0; hour < 24; hour++)
                {
                    string key = day + "-" + hour.ToString("D2");
                    if (report.ContainsKey(key) == false)
                    {
                        report.Add(key, 0);
                    }
                }
            }

            return Ok(report);
        }

        // GET /user_usage_stats/{BreakdownType}/BreakdownReport?user_id=&days=&end_date=
        [HttpGet("{BreakdownType}/BreakdownReport")]
        public ActionResult GetBreakdownReport(
            [FromRoute] string BreakdownType,
            [FromQuery] string user_id,
            [FromQuery] int days,
            [FromQuery] string end_date)
        {
            DateTime endDate = ParseEndDate(end_date);

            ReportPlaybackOptions config = _config.GetReportPlaybackOptions();
            List<Dictionary<string, object>> report = GetRepository().GetBreakdownReport(
                user_id,
                days,
                endDate,
                BreakdownType,
                config);

            if (BreakdownType == "UserId")
            {
                foreach (var row in report)
                {
                    string row_user_id = row["label"] as string;
                    User user = null;
                    if (!string.IsNullOrEmpty(row_user_id) && Guid.TryParse(row_user_id, out Guid user_guid))
                    {
                        user = _userManager.GetUserById(user_guid);
                    }

                    if (user != null)
                    {
                        row["label"] = user.Username;
                    }
                    else
                    {
                        row["label"] = "unknown";
                    }
                }
            }

            return Ok(report);
        }

        // GET /user_usage_stats/TvShowsReport?user_id=&days=&end_date=
        [HttpGet("TvShowsReport")]
        public ActionResult GetTvShowsReport(
            [FromQuery] string user_id,
            [FromQuery] int days,
            [FromQuery] string end_date)
        {
            DateTime endDate = ParseEndDate(end_date);
            ReportPlaybackOptions config = _config.GetReportPlaybackOptions();
            List<Dictionary<string, object>> report = GetRepository().GetTvShowReport(user_id, days, endDate, config);
            return Ok(report);
        }

        // GET /user_usage_stats/MoviesReport?user_id=&days=&end_date=
        [HttpGet("MoviesReport")]
        public ActionResult GetMoviesReport(
            [FromQuery] string user_id,
            [FromQuery] int days,
            [FromQuery] string end_date)
        {
            DateTime endDate = ParseEndDate(end_date);
            ReportPlaybackOptions config = _config.GetReportPlaybackOptions();
            List<Dictionary<string, object>> report = GetRepository().GetMoviesReport(user_id, days, endDate, config);
            return Ok(report);
        }

        // GET /user_usage_stats/get_items?filter=&item_type=&parent=
        [HttpGet("get_items")]
        public ActionResult GetItems(
            [FromQuery] string filter,
            [FromQuery] string item_type,
            [FromQuery] string parent)
        {
            List<ItemInfo> items = new List<ItemInfo>();

            InternalItemsQuery query = new InternalItemsQuery();
            query.IsVirtualItem = false;

            if (!string.IsNullOrEmpty(parent) && Guid.TryParse(parent, out Guid parentId))
            {
                query.ParentId = parentId;
            }
            else if (!string.IsNullOrEmpty(filter))
            {
                query.IncludeItemTypes = new[] { BaseItemKind.MusicAlbum, BaseItemKind.Movie, BaseItemKind.Series };
                query.SearchTerm = filter;
            }
            else
            {
                query.IncludeItemTypes = new[] { BaseItemKind.CollectionFolder };
            }

            IReadOnlyList<BaseItem> results = _libraryManager.GetItemList(query);

            foreach (BaseItem item in results)
            {
                ItemInfo info = new ItemInfo();
                info.Id = item.Id.ToString("N");
                info.Name = item.Name;
                info.ItemType = item.GetType().Name;

                if (item.GetType() == typeof(Episode))
                {
                    Episode e = (Episode)item;
                    info.Series = e.SeriesName;
                    info.Season = e.Season?.Name;

                    string epp_name = "";
                    if (e.IndexNumber != null)
                    {
                        epp_name += e.IndexNumber.Value.ToString("D2");
                    }
                    else
                    {
                        epp_name += "00";
                    }
                    epp_name += " - " + e.Name;

                    info.Name = epp_name;
                }
                else if (item.GetType() == typeof(Season))
                {
                    string season_name = "";
                    if (item.IndexNumber != null)
                    {
                        season_name += item.IndexNumber.Value.ToString("D2");
                    }
                    else
                    {
                        season_name += "00";
                    }
                    season_name += " - " + item.Name;
                    info.Name = season_name;
                }

                items.Add(info);
            }

            items.Sort(delegate (ItemInfo c1, ItemInfo c2) { return string.Compare(c1.Name, c2.Name, comparisonType: StringComparison.OrdinalIgnoreCase); });
            return Ok(items);
        }

        // GET /user_usage_stats/get_item_stats?id=
        [HttpGet("get_item_stats")]
        public ActionResult GetItemStats([FromQuery] string id)
        {
            List<Dictionary<string, object>> details = new List<Dictionary<string, object>>();

            BaseItem item = null;
            if (!string.IsNullOrEmpty(id) && Guid.TryParse(id, out Guid item_guid))
            {
                item = _libraryManager.GetItemById(item_guid);
            }

            if (item == null)
            {
                return Ok(details);
            }

            ItemChildStats child_stats = null;
            if (item.GetType() == typeof(Series) || item.GetType() == typeof(Season))
            {
                child_stats = GetChildStats(item);
            }

            foreach (User user in _userManager.GetUsers())
            {
                UserItemData uid = _userDataManager.GetUserData(user, item);

                Dictionary<string, object> user_info = new Dictionary<string, object>();
                user_info.Add("name", user.Username);
                user_info.Add("played", uid.Played.ToString());
                user_info.Add("play_count", uid.PlayCount.ToString());
                if (uid.LastPlayedDate != null)
                {
                    user_info.Add("last_played", uid.LastPlayedDate.Value.ToString("yyyy-MM-dd HH:mm:ss"));
                }
                else
                {
                    user_info.Add("last_played", "");
                }

                if (child_stats != null && child_stats.Stats.ContainsKey(user))
                {
                    user_info.Add("child_stats", child_stats.Stats[user] + "/" + child_stats.Total);
                    user_info.Add("child_watched", child_stats.Stats[user]);
                    user_info.Add("child_total", child_stats.Total);
                }

                details.Add(user_info);
            }

            return Ok(details);
        }

        private ItemChildStats GetChildStats(BaseItem item)
        {
            InternalItemsQuery query = new InternalItemsQuery();
            query.AncestorIds = new Guid[] { item.Id };
            query.IncludeItemTypes = new[] { BaseItemKind.Episode };
            query.Recursive = true;
            query.IsVirtualItem = false;

            ItemChildStats stats = new ItemChildStats();
            IReadOnlyList<BaseItem> results = _libraryManager.GetItemList(query);
            stats.Total = results.Count;

            foreach (User user in _userManager.GetUsers())
            {
                foreach (BaseItem child in results)
                {
                    UserItemData uid = _userDataManager.GetUserData(user, child);
                    if (uid.Played)
                    {
                        if (stats.Stats.ContainsKey(user))
                        {
                            stats.Stats[user]++;
                        }
                        else
                        {
                            stats.Stats.Add(user, 1);
                        }
                    }
                    else
                    {
                        if (!stats.Stats.ContainsKey(user))
                        {
                            stats.Stats.Add(user, 0);
                        }
                    }
                }
            }

            return stats;
        }

        // GET /user_usage_stats/get_item_path?id=
        [HttpGet("get_item_path")]
        public ActionResult GetItemPath([FromQuery] string id)
        {
            List<PathItem> item_path = new List<PathItem>();

            BaseItem item = null;
            if (!string.IsNullOrEmpty(id) && Guid.TryParse(id, out Guid item_guid))
            {
                item = _libraryManager.GetItemById(item_guid);
            }

            if (item == null)
            {
                return Ok(item_path);
            }

            bool hadTopParent = false;
            while (item != null && !item.IsTopParent)
            {
                PathItem pi = new PathItem();
                pi.Name = item.Name;
                pi.Id = item.Id.ToString("N");
                pi.ItemType = item.GetType().Name;
                item_path.Insert(0, pi);

                item = item.GetParent();

                if (item != null && item.IsTopParent)
                {
                    hadTopParent = true;
                }
            }

            if (hadTopParent && item != null)
            {
                PathItem pi = new PathItem();
                pi.Name = item.Name;
                pi.Id = item.Id.ToString("N");
                pi.ItemType = item.GetType().Name;
                item_path.Insert(0, pi);

                var collection = _libraryManager.GetCollectionFolders(item).FirstOrDefault();
                if (collection != null)
                {
                    PathItem cpi = new PathItem();
                    cpi.Name = collection.Name;
                    cpi.Id = collection.Id.ToString("N");
                    cpi.ItemType = collection.GetType().Name;
                    item_path.Insert(0, cpi);
                }
            }

            return Ok(item_path);
        }

        private string GetLastSeenString(TimeSpan span)
        {
            String last_seen = "";

            if (span.TotalDays > 365)
            {
                last_seen += GetTimePart((int)(span.TotalDays / 365), "y");
            }

            if ((int)(span.TotalDays % 365) > 7)
            {
                last_seen += GetTimePart((int)((span.TotalDays % 365) / 7), "w");
            }

            if ((int)(span.TotalDays % 7) > 0)
            {
                last_seen += GetTimePart((int)(span.TotalDays % 7), "d");
            }

            if (span.Hours > 0)
            {
                last_seen += GetTimePart(span.Hours, "h");
            }

            if (span.Minutes > 0)
            {
                last_seen += GetTimePart(span.Minutes, "m");
            }

            return last_seen;
        }

        private string GetTimePart(int value, string name)
        {
            string part = value + name;
            return part + " ";
        }

        public class CustomQueryData
        {
            public string CustomQueryString { get; set; } = "";
            public bool ReplaceUserId { get; set; } = false;
        }
    }
}
