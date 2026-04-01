import { profileData } from "../data.js";
import { hydrateHomeTokens, hydrateProfileTokens, showBanner } from "../shell.js";

export function setupProfilePage() {
  if (document.body.dataset.page !== "profile") {
    return;
  }

  const form = document.querySelector("[data-profile-form]");
  const banner = document.querySelector("[data-profile-banner]");

  if (!form) {
    return;
  }

  form.elements.nickname.value = profileData.nickname;
  form.elements.email.value = profileData.email;
  form.elements.age.value = profileData.age;
  form.elements.gender.value = profileData.gender;
  form.elements.preferredGender.value = profileData.preferred_gender;
  form.elements.grade.value = profileData.my_grade;
  form.elements.campus.value = profileData.campus;
  form.elements.interests.value = profileData.interests.join("、");

  form.querySelectorAll('[name="acceptedCampus"]').forEach((input) => {
    input.checked = profileData.accepted_campus.includes(input.value);
  });

  form.querySelectorAll('[name="coreTraits"]').forEach((input) => {
    input.checked = profileData.core_traits.includes(input.value);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nickname = form.elements.nickname.value.trim();
    const interests = form.elements.interests.value
      .split(/[、，,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const acceptedCampus = Array.from(form.querySelectorAll('[name="acceptedCampus"]:checked')).map(
      (input) => input.value
    );
    const coreTraits = Array.from(form.querySelectorAll('[name="coreTraits"]:checked')).map(
      (input) => input.value
    );

    if (nickname.length < 2 || interests.length < 2 || acceptedCampus.length === 0) {
      showBanner(banner, {
        tone: "danger",
        title: "资料还没填完整",
        body: "昵称至少 2 个字，兴趣建议填 2 项以上，并至少选择一个可接受校区。",
      });
      return;
    }

    profileData.nickname = nickname;
    profileData.interests = interests;
    profileData.accepted_campus = acceptedCampus;
    profileData.core_traits = coreTraits.length ? coreTraits : profileData.core_traits;
    profileData.gender = form.elements.gender.value;
    profileData.preferred_gender = form.elements.preferredGender.value;
    profileData.my_grade = form.elements.grade.value;
    profileData.campus = form.elements.campus.value;

    hydrateProfileTokens();
    hydrateHomeTokens();

    showBanner(banner, {
      tone: "success",
      title: "问卷已保存",
      body: "资料已保存，左侧摘要也已经同步更新。",
    });
  });
}

