export const isValidEmail = (email) => {
    // Standard basic email regex
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

export const isValidIndianMobileNumber = (mobile) => {
    // Allows optional +91, 91, or 0. Followed by exactly 10 digits starting with 6-9
    const re = /^(?:(?:\+|0{0,2})91[\s-]?)?[6789]\d{9}$/;
    return re.test(mobile);
};

export const isValidHexColor = (color) => {
    // Allows standard 3 or 6 character hex colors starting with #
    const re = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    return re.test(color);
};
