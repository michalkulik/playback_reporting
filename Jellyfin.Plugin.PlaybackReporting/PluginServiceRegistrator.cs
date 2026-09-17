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

using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.PlaybackReporting
{
    /// <summary>
    /// Registers the plugin services with Jellyfin's dependency injection container.
    /// </summary>
    /// <remarks>
    /// Jellyfin does not scan plugin assemblies for <see cref="Microsoft.Extensions.Hosting.IHostedService"/>
    /// implementations. The playback monitor is only started when the plugin explicitly
    /// registers it through <see cref="IPluginServiceRegistrator"/>.
    /// </remarks>
    public class PluginServiceRegistrator : IPluginServiceRegistrator
    {
        /// <inheritdoc />
        public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
        {
            serviceCollection.AddHostedService<EventMonitorEntryPoint>();
        }
    }
}
