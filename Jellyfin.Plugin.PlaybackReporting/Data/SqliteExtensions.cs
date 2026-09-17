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

using System.Collections.Generic;
using System.Globalization;
using SQLitePCL.pretty;

namespace Jellyfin.Plugin.PlaybackReporting.Data
{
    /// <summary>
    /// Value accessors for a SQLitePCL.pretty result row.
    /// SQLitePCL.pretty 3.x exposes <c>IStatement.Current</c> as
    /// <see cref="IReadOnlyList{T}"/> of <see cref="ResultSetValue"/> without the
    /// <c>GetString</c>/<c>GetInt</c> helpers this code was written against.
    /// </summary>
    public static class SqliteExtensions
    {
        public static string GetString(this IReadOnlyList<ResultSetValue> row, int index)
        {
            return row[index].ToString();
        }

        public static int GetInt(this IReadOnlyList<ResultSetValue> row, int index)
        {
            string value = row[index].ToString();
            if (int.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out int result))
            {
                return result;
            }

            return 0;
        }
    }
}
