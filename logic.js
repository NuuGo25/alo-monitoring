(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AloPrototypeLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeNote(value, maxLength = 300) {
    return String(value ?? '').trim().slice(0, maxLength);
  }

  function localDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isDateInRange(value, startDate, endDate) {
    const key = localDateKey(value);
    if (!key) return false;
    return (!startDate || key >= startDate) && (!endDate || key <= endDate);
  }

  function isValidDateRange(startDate, endDate) {
    return !startDate || !endDate || startDate <= endDate;
  }

  function calendarDays(year, month) {
    const firstDay = new Date(year, month, 1);
    const mondayOffset = (firstDay.getDay() + 6) % 7;

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(year, month, 1 - mondayOffset + index);
      return {
        key: localDateKey(date),
        day: date.getDate(),
        currentMonth: date.getMonth() === month,
      };
    });
  }

  function applyDateSelection(mode, startDate, endDate, selectedDate) {
    if (mode === 'single') {
      return { start: selectedDate, end: selectedDate, complete: true };
    }
    if (!startDate || endDate) {
      return { start: selectedDate, end: '', complete: false };
    }
    return selectedDate < startDate
      ? { start: selectedDate, end: startDate, complete: true }
      : { start: startDate, end: selectedDate, complete: true };
  }

  return {
    normalizeNote,
    localDateKey,
    isDateInRange,
    isValidDateRange,
    calendarDays,
    applyDateSelection,
  };
});
