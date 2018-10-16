
const https = require('https');
const axios = require('axios').default;
const cheerio = require('cheerio');
const semver = require('semver');
const { filter } = require('bluebird');
const { promisify } = require('util');
const { createGunzip } = require('zlib');
const { createWriteStream, unlink, writeFile } = require('fs');

const extensionsFile = './extensions.json';
const extensions = require(extensionsFile);
const writeFileAsync = promisify(writeFile);

/**
 * Download extension from vscode marketplace
 *
 * @param {string} extensionName
 * @param {string} version
 */
function downloadExtension(extensionName, version = 'latest') {
    const [publisher, name] = extensionName.split('.');
    return new Promise((resolve, reject) => {
        https.get(`https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${name}/${version}/vspackage`, (response) => {
            const filename = /filename=(.*);/gi.exec(response.headers['content-disposition'])[1];

            const file = createWriteStream(`extensions/${filename}`);
            response.pipe(createGunzip()).pipe(file);

            file.on('finish', () => {
                resolve(filename);
            });

            file.on('error', (err) => {
                unlink(filename, () => {
                    reject(err);
                });
            });
        });
    });
}

/**
 * Get extension last version
 *
 * @param {string} extensionName
 */
async function getExtensionLastVersion(extensionName) {
    try {
        const res = await axios.get(`https://marketplace.visualstudio.com/items?itemName=${extensionName}`);
        const $ = cheerio.load(res.data);
        const selector = $('script.vss-extension')[0];
        const extensionDetails = JSON.parse(selector.firstChild.data);
        const { version } = extensionDetails.versions[0];

        return version;
    } catch (error) {
        console.error(error);
    }
}

/**
 * Get extensions with new versions
 */
function getNewExtensions() {
    return filter(extensions, (extension) => {
        const { name, version } = extension;

        return getExtensionLastVersion(name)
            .then((lastVersion) => {
                if (!semver.valid(version) || semver.gt(lastVersion, version)) {
                    extension.version = lastVersion;
                    return true;
                }

                return false;
            });
    });
}

/**
 * Download extensions from extensions.json file
 */
async function downloadExtensions() {
    try {
        // Get extensions with new versions
        const extensionsToDownload = await getNewExtensions();

        if (extensionsToDownload.length) {
            // Download extensions to extensions folder
            await Promise.all(extensionsToDownload.map(extension => downloadExtension(extension.name, extension.version)));

            // Overwrite extensions.json file with new versions
            await writeFileAsync(extensionsFile, JSON.stringify(extensions, null, 4));

            console.log(`${extensionsToDownload.length} extensions downloaded successfully`);
        } else {
            console.log('No new extensions found to download');
        }
    } catch (error) {
        console.error(error);
    }
}

// Start
downloadExtensions();
