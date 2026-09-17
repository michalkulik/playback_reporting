using System;
using System.Collections.Generic;
using System.Text;
using User = Jellyfin.Database.Implementations.Entities.User;

namespace Jellyfin.Plugin.PlaybackReporting.Data
{
    public class ItemChildStats
    {
        public Dictionary<User, int> Stats { get; set; } = new Dictionary<User, int>();
        public int Total { get; set; }
    }
}
