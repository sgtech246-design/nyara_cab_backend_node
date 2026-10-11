import twilio from 'twilio';

class TwilioService {
  constructor() {
    this.sid = process.env.TWILIO_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_FROM;
    this.verifySid = process.env.TWILIO_VERIFY_SID || 'VA697779f85cfe65f12827a6253f7f0239';

    if (this.sid && this.authToken) {
      this.client = twilio(this.sid, this.authToken);
    }
  }

  formatPhoneNumber(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `+91${digits}`;
    }
    if (!phone.startsWith('+')) {
      return `+${digits}`;
    }
    return phone;
  }

  async sendOtp(phone, otpCode) {
    const formattedPhone = this.formatPhoneNumber(phone);

    if (this.client) {
      try {
        if (this.verifySid) {
          await this.client.verify.v2
            .services(this.verifySid)
            .verifications.create({
              to: formattedPhone,
              channel: 'sms',
              codeLength: 6,
            });
          console.log(`[Twilio Verify] SMS sent to ${formattedPhone}`);
          return true;
        }
      } catch (err) {
        console.warn(`[Twilio Verify Error] ${err.message}. Trying standard SMS fallback...`);
      }

      try {
        if (this.fromNumber) {
          await this.client.messages.create({
            from: this.fromNumber,
            to: formattedPhone,
            body: `Your Nyara Cab verification code is ${otpCode}`,
          });
          console.log(`[Twilio Standard] SMS sent to ${formattedPhone}`);
          return true;
        }
      } catch (err) {
        console.error(`[Twilio Standard Error] ${formattedPhone}: ${err.message}`);
      }
    }

    console.log(`[MOCK / DEV OTP] Generated OTP for ${formattedPhone} is: ${otpCode}`);
    return true;
  }

  async checkOtp(phone, otpCode) {
    const formattedPhone = this.formatPhoneNumber(phone);

    if (this.client && this.verifySid) {
      try {
        const check = await this.client.verify.v2
          .services(this.verifySid)
          .verificationChecks.create({
            to: formattedPhone,
            code: otpCode,
          });

        if (check.status === 'approved') {
          console.log(`[Twilio Verify] Approved for ${formattedPhone}`);
          return true;
        }
      } catch (err) {
        console.error(`[Twilio Verify Check Error] ${formattedPhone}:`, err.message);
      }
    }

    return false;
  }
}

export const twilioService = new TwilioService();
