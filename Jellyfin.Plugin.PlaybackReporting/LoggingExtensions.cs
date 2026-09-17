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
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.PlaybackReporting
{
    /// <summary>
    /// Thin compatibility shims that let the code ported from Emby keep its
    /// <c>ILogger.Info(...)</c> / <c>ILogger.Error(...)</c> call sites while using
    /// <see cref="Microsoft.Extensions.Logging.ILogger"/> under the hood.
    /// </summary>
    public static class LoggingExtensions
    {
        public static void Info(this ILogger logger, string message)
        {
            logger.LogInformation("{Message}", message);
        }

        public static void Debug(this ILogger logger, string message)
        {
            logger.LogDebug("{Message}", message);
        }

        public static void Warn(this ILogger logger, string message)
        {
            logger.LogWarning("{Message}", message);
        }

        public static void Error(this ILogger logger, string message)
        {
            logger.LogError("{Message}", message);
        }

        public static void Error(this ILogger logger, string message, Exception exception)
        {
            logger.LogError(exception, "{Message}", message);
        }
    }
}
