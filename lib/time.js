const APP_TIME_ZONE = 'America/New_York';

function getAppTimeZone() {
  return APP_TIME_ZONE;
}

function getCurrentDateInAppTimeZone() {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: APP_TIME_ZONE
  });
}

function getTomorrowDateInAppTimeZone() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return tomorrow.toLocaleDateString('en-CA', {
    timeZone: APP_TIME_ZONE
  });
}

module.exports = {
  APP_TIME_ZONE,
  getAppTimeZone,
  getCurrentDateInAppTimeZone,
  getTomorrowDateInAppTimeZone
};
