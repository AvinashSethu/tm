import { getFullUserByID } from "@/src/libs/user/userProfile";
import { withAuth, handleError } from "@/src/utils/sessionHandler";

export async function GET() {
  return withAuth(async (session) => {
    try {
      const userProfileData = await getFullUserByID(session.id);
      if (!userProfileData) {
        return Response.json(
          { success: false, message: "User profile data not found" },
          { status: 404 }
        );
      }

      // Never return the raw row: it holds the password hash and OTP/reset
      // token. Send only the fields the profile screens display.
      const { name, email, phoneNumber, gender, image } = userProfileData;
      return Response.json({
        success: true,
        data: { name, email, phoneNumber, gender, image },
      });
    } catch (error) {
      return handleError(error);
    }
  });
}
