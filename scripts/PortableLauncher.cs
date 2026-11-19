using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

namespace CalendarioLauncher
{
    internal static class Program
    {
        private const string PayloadId = "__PAYLOAD_ID__";
        private const string ApplicationFileName = "Calendario.exe";
        private const string ReadyFileName = ".calendar-ready";

        [STAThread]
        private static int Main()
        {
            try
            {
                string appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string cacheRoot = Path.Combine(appData, "Calendario", "portable");
                string cacheDirectory = Path.Combine(cacheRoot, PayloadId);
                string executablePath = Path.Combine(cacheDirectory, ApplicationFileName);
                string readyPath = Path.Combine(cacheDirectory, ReadyFileName);

                Directory.CreateDirectory(cacheRoot);
                using (Mutex mutex = new Mutex(false, "Local\\Calendario-" + PayloadId))
                {
                    try
                    {
                        mutex.WaitOne();
                    }
                    catch (AbandonedMutexException)
                    {
                    }

                    try
                    {
                        if (!IsCacheReady(readyPath, executablePath))
                        {
                            ExtractApplication(cacheDirectory);
                        }
                    }
                    finally
                    {
                        mutex.ReleaseMutex();
                    }
                }

                Process.Start(new ProcessStartInfo
                {
                    FileName = executablePath,
                    WorkingDirectory = cacheDirectory,
                    UseShellExecute = false
                });
                return 0;
            }
            catch (Exception error)
            {
                MessageBox.Show(
                    "Não foi possível preparar o Calendário.\r\n\r\n" + error.Message,
                    "Calendário",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return 1;
            }
        }

        private static bool IsCacheReady(string readyPath, string executablePath)
        {
            return File.Exists(executablePath)
                && File.Exists(readyPath)
                && File.ReadAllText(readyPath) == PayloadId;
        }

        private static void ExtractApplication(string cacheDirectory)
        {
            string stagingDirectory = cacheDirectory + ".preparing";
            if (Directory.Exists(stagingDirectory))
            {
                Directory.Delete(stagingDirectory, true);
            }

            Directory.CreateDirectory(stagingDirectory);
            Exception extractionError = null;

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            using (Form splash = CreateSplash())
            {
                splash.Shown += delegate
                {
                    ThreadPool.QueueUserWorkItem(delegate
                    {
                        try
                        {
                            ExtractPayload(stagingDirectory);
                            string executablePath = Path.Combine(stagingDirectory, ApplicationFileName);
                            if (!File.Exists(executablePath))
                            {
                                throw new InvalidDataException("O executável não foi encontrado no pacote.");
                            }

                            File.WriteAllText(
                                Path.Combine(stagingDirectory, ReadyFileName),
                                PayloadId
                            );

                            if (Directory.Exists(cacheDirectory))
                            {
                                Directory.Delete(cacheDirectory, true);
                            }

                            Directory.Move(stagingDirectory, cacheDirectory);
                        }
                        catch (Exception error)
                        {
                            extractionError = error;
                        }
                        finally
                        {
                            splash.BeginInvoke((MethodInvoker)delegate
                            {
                                splash.Close();
                            });
                        }
                    });
                };

                Application.Run(splash);
            }

            if (extractionError != null)
            {
                if (Directory.Exists(stagingDirectory))
                {
                    Directory.Delete(stagingDirectory, true);
                }
                throw new InvalidOperationException("Falha ao extrair os arquivos do aplicativo.", extractionError);
            }
        }

        private static Form CreateSplash()
        {
            Form form = new Form
            {
                Text = "Calendário",
                ClientSize = new Size(420, 150),
                FormBorderStyle = FormBorderStyle.FixedDialog,
                ControlBox = false,
                MaximizeBox = false,
                MinimizeBox = false,
                StartPosition = FormStartPosition.CenterScreen,
                ShowInTaskbar = true,
                TopMost = true,
                BackColor = Color.FromArgb(243, 241, 236)
            };

            Label title = new Label
            {
                AutoSize = false,
                Location = new Point(28, 22),
                Size = new Size(364, 28),
                Font = new Font("Segoe UI", 15, FontStyle.Bold),
                ForeColor = Color.FromArgb(32, 40, 43),
                Text = "Preparando o Calendário"
            };

            Label description = new Label
            {
                AutoSize = false,
                Location = new Point(29, 55),
                Size = new Size(364, 24),
                Font = new Font("Segoe UI", 9),
                ForeColor = Color.FromArgb(120, 129, 132),
                Text = "Na primeira abertura, os arquivos são preparados."
            };

            ProgressBar progress = new ProgressBar
            {
                Location = new Point(29, 94),
                Size = new Size(362, 14),
                Style = ProgressBarStyle.Marquee,
                MarqueeAnimationSpeed = 24
            };

            form.Controls.Add(title);
            form.Controls.Add(description);
            form.Controls.Add(progress);
            return form;
        }

        private static void ExtractPayload(string destination)
        {
            string destinationRoot = Path.GetFullPath(destination) + Path.DirectorySeparatorChar;
            using (Stream payload = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream("Calendario.Payload.zip"))
            {
                if (payload == null)
                {
                    throw new InvalidDataException("O pacote de arquivos não foi encontrado.");
                }

                using (ZipArchive archive = new ZipArchive(payload, ZipArchiveMode.Read))
                {
                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        string relativePath = entry.FullName
                            .Replace('/', Path.DirectorySeparatorChar)
                            .Replace('\\', Path.DirectorySeparatorChar);
                        string targetPath = Path.GetFullPath(Path.Combine(destination, relativePath));
                        if (!targetPath.StartsWith(destinationRoot, StringComparison.OrdinalIgnoreCase))
                        {
                            throw new InvalidDataException("O pacote contém um caminho inválido.");
                        }

                        if (entry.FullName.EndsWith("/", StringComparison.Ordinal))
                        {
                            Directory.CreateDirectory(targetPath);
                            continue;
                        }

                        string parent = Path.GetDirectoryName(targetPath);
                        if (!Directory.Exists(parent))
                        {
                            Directory.CreateDirectory(parent);
                        }

                        using (Stream source = entry.Open())
                        using (FileStream target = new FileStream(targetPath, FileMode.Create, FileAccess.Write))
                        {
                            source.CopyTo(target);
                        }
                    }
                }
            }
        }
    }
}
